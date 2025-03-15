import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { kebabCase } from "lodash";
import { stringSimilarity } from "string-similarity-js";
import { GamesService } from "../../../src/modules/games/games.service";
import { GamevaultGame } from "../../../src/modules/games/gamevault-game.entity";
import configuration, { getCensoredConfiguration } from "./configuration";
import { GetOwnedGamesResponseWrapper, Game as SteamGame } from "./models";

@Injectable()
export class SteamDupeFinderService {
  private readonly logger = new Logger(SteamDupeFinderService.name);
  private readonly DUPLICATE_TAG = "Duplicate: Steam";

  constructor(private readonly gamesService: GamesService) {
    this.logger.log({
      message: "Loaded Steam Dupe Finder Configuration.",
      configuration: getCensoredConfiguration(),
    });
    this.findDuplicates();
  }

  @Cron(`*/${configuration.INTERVAL} * * * *`, {
    disabled: configuration.INTERVAL <= 0,
  })
  async findDuplicates(): Promise<void> {
    this.logger.log("Starting duplicate detection.");
    try {
      const [steamGames, gamevaultGames] = await Promise.all([
        this.fetchSteamGames(),
        this.fetchGamevaultGames(),
      ]);

      this.logger.log(
        `Fetched ${steamGames.length} Steam games and ${gamevaultGames.length} Gamevault games.`,
      );

      const duplicates = this.identifyDuplicateGames(
        gamevaultGames,
        steamGames,
      );

      this.logger.log(`Identified ${duplicates.size} duplicates.`);

      await this.tagGamesAsDuplicate(duplicates);
      this.logger.log("Finished tagging duplicates.");
    } catch (error) {
      this.logger.error("Error during duplicate detection", error);
    }
  }

  /**
   * Fetches the list of Steam games from the official Steam API.
   */
  private async fetchSteamGames(): Promise<SteamGame[]> {
    this.logger.debug("Fetching Steam games from API.");
    this.validateSteamConfig();

    const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?include_appinfo=1&key=${configuration.STEAM_API_KEY}&steamid=${configuration.STEAM_USER_ID}&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      const errorMsg = `Steam API fetch failed with ${response.status}: ${response.statusText}`;
      this.logger.error(errorMsg);
      throw new BadRequestException(errorMsg);
    }

    const data: GetOwnedGamesResponseWrapper = await response.json();
    this.logger.log(
      `Successfully fetched ${data.response.game_count} Steam games.`,
    );

    return data.response.games;
  }

  /**
   * Fetches the list of games from the Gamevault database.
   */
  private async fetchGamevaultGames(): Promise<GamevaultGame[]> {
    this.logger.debug("Fetching Gamevault games from database.");
    return this.gamesService.find({
      loadRelations: true,
      loadDeletedEntities: false,
    });
  }

  /**
   * Identifies duplicate games using two methods:
   * 1. Exact match by Steam App ID
   * 2. Fuzzy match by title similarity
   */
  private identifyDuplicateGames(
    gamevaultGames: GamevaultGame[],
    steamGames: SteamGame[],
  ): Set<GamevaultGame> {
    this.logger.debug("Identifying duplicate games.");
    const duplicates = new Set<GamevaultGame>();

    const steamGameMap = new Map(
      steamGames.map((game) => [game.appid.toString(), game]),
    );

    for (const gamevaultGame of gamevaultGames) {
      if (
        gamevaultGame.user_metadata?.tags?.some(
          (tag) => tag.name === this.DUPLICATE_TAG,
        )
      ) {
        this.logger.debug(
          `Skipping already tagged game: ${gamevaultGame.title}`,
        );
        continue;
      }

      // Extract Steam App ID from Gamevault metadata
      const steamId = this.extractSteamAppId(gamevaultGame);
      if (steamId && steamGameMap.has(steamId)) {
        duplicates.add(gamevaultGame);
        this.logDuplicate(gamevaultGame, steamGameMap.get(steamId)!);
        continue;
      }

      for (const steamGame of steamGames) {
        if (
          stringSimilarity(
            kebabCase(gamevaultGame.title),
            kebabCase(steamGame.name),
          ) > 0.9
        ) {
          duplicates.add(gamevaultGame);
          this.logDuplicate(gamevaultGame, steamGame);
          break;
        }
      }
    }

    return duplicates;
  }

  /**
   * Logs detected duplicate games.
   */
  private logDuplicate(
    gamevaultGame: GamevaultGame,
    steamGame: SteamGame,
  ): void {
    this.logger.log(
      `Duplicate detected: Gamevault [${gamevaultGame.title}] matches Steam [${steamGame.name}]`,
    );
  }

  /**
   * Tags duplicate games with "Duplicate: Steam" in their metadata.
   * Avoids re-tagging already tagged games and batches updates for efficiency.
   */
  private async tagGamesAsDuplicate(
    duplicates: Set<GamevaultGame>,
  ): Promise<void> {
    if (duplicates.size === 0) {
      this.logger.debug("No duplicates to tag.");
      return;
    }

    // Extract tag names before checking for "Duplicate: Steam"
    const updates = [...duplicates]
      .filter(
        (game) =>
          !(game.user_metadata?.tags ?? []).some(
            (tag) => tag.name === this.DUPLICATE_TAG,
          ),
      )
      .map((game) => ({
        id: game.id,
        user_metadata: {
          tags: [
            ...(game.user_metadata?.tags ?? []).map((tag) => tag.name),
            this.DUPLICATE_TAG,
          ],
        },
      }));

    this.logger.log(`Tagging ${updates.length} games as duplicates.`);

    await Promise.all(
      updates.map((update) => this.gamesService.update(update.id, update)),
    );

    this.logger.log(`Successfully tagged duplicates.`);
  }

  /**
   * Ensures required Steam configuration values are set before making API requests.
   */
  private validateSteamConfig(): void {
    if (!configuration.STEAM_API_KEY) {
      this.logger.error("Steam API key is missing.");
      throw new BadRequestException("Steam API key not configured.");
    }

    if (!configuration.STEAM_USER_ID) {
      this.logger.error("Steam User ID is missing.");
      throw new BadRequestException("Steam User ID not configured.");
    }
  }

  /**
   * Extracts the Steam App ID from Gamevault's metadata.
   * If a Steam store URL is found, the App ID is extracted using regex.
   */
  private extractSteamAppId(game: GamevaultGame): string | null {
    const appId =
      game.provider_metadata
        ?.flatMap((metadata) =>
          metadata.url_websites?.map(
            (url) => url.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1],
          ),
        )
        .find(Boolean) ?? null;

    this.logger.debug(
      `Extracted Steam App ID ${appId ?? "none"} for Gamevault game: ${game.title}`,
    );

    return appId;
  }
}
