import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { stringSimilarity } from "string-similarity-js";
import { GamesService } from "../../../src/modules/games/games.service";
import { GamevaultGame } from "../../../src/modules/games/gamevault-game.entity";
import configuration from "./configuration";
import { GetOwnedGamesResponseWrapper, Game as SteamGame } from "./models";

@Injectable()
export class SteamDupeFinderService {
  private readonly logger = new Logger(SteamDupeFinderService.name);
  private readonly DUPLICATE_TAG = "Duplicate: Steam";

  constructor(private readonly gamesService: GamesService) {}

  /**
   * Runs the duplicate detection at scheduled intervals.
   */
  @Cron(`*/${configuration.INTERVAL} * * * *`, {
    disabled: configuration.INTERVAL <= 0,
  })
  async findDuplicates(): Promise<void> {
    try {
      // Fetch both Steam and Gamevault games in parallel (no caching)
      const [steamGames, gamevaultGames] = await Promise.all([
        this.fetchSteamGames(),
        this.fetchGamevaultGames(),
      ]);

      // Identify duplicate games
      const duplicates = this.identifyDuplicateGames(
        gamevaultGames,
        steamGames,
      );

      // Tag detected duplicates
      await this.tagGamesAsDuplicate(duplicates);
    } catch (error) {
      this.logger.error("Error finding duplicates", error);
    }
  }

  /**
   * Fetches the list of Steam games from the official Steam API.
   */
  private async fetchSteamGames(): Promise<SteamGame[]> {
    this.logger.debug("Fetching Steam Games");
    this.validateSteamConfig(); // Ensure API key and User ID are set

    const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?include_appinfo=1&key=${configuration.STEAM_API_KEY}&steamid=${configuration.STEAM_USER_ID}&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      this.logger.error(
        `Failed to fetch Steam Games: ${response.status} ${response.statusText}`,
      );
      throw new BadRequestException("Failed to fetch Steam Games.");
    }

    // Parse response data
    const data: GetOwnedGamesResponseWrapper = await response.json();
    this.logger.log(`Fetched ${data.response.game_count} Steam Games.`);

    return data.response.games;
  }

  /**
   * Fetches the list of games from the Gamevault database.
   */
  private async fetchGamevaultGames(): Promise<GamevaultGame[]> {
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
    const duplicates = new Set<GamevaultGame>();

    // Create a Map for Steam games to allow fast lookups by App ID
    const steamGameMap = new Map(
      steamGames.map((game) => [game.appid.toString(), game]),
    );

    for (const gamevaultGame of gamevaultGames) {
      // Skip games that are already marked as duplicates
      if (
        gamevaultGame.user_metadata?.tags?.some(
          (tag) => tag.name === this.DUPLICATE_TAG,
        )
      ) {
        continue;
      }

      // Extract Steam App ID from Gamevault metadata
      const steamId = this.extractSteamAppId(gamevaultGame);

      // 1. Check for exact match by Steam App ID
      if (steamId && steamGameMap.has(steamId)) {
        duplicates.add(gamevaultGame);
        this.logDuplicate(gamevaultGame, [steamGameMap.get(steamId)!]);
        continue;
      }

      // 2. Check for title similarity (fuzzy matching)
      for (const steamGame of steamGames) {
        if (stringSimilarity(gamevaultGame.title, steamGame.name) > 0.9) {
          duplicates.add(gamevaultGame);
          this.logDuplicate(gamevaultGame, [steamGame]);
          break; // Stop checking once a match is found
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
    steamGames: SteamGame[],
  ): void {
    const matchedSteamGame = steamGames[0];
    this.logger.log({
      message: "Found duplicate game.",
      gamevault_title: gamevaultGame.title,
      steam_title: matchedSteamGame.name,
    });
  }

  /**
   * Tags duplicate games with "Duplicate: Steam" in their metadata.
   * Avoids re-tagging already tagged games and batches updates for efficiency.
   */
  private async tagGamesAsDuplicate(
    duplicates: Set<GamevaultGame>,
  ): Promise<void> {
    if (duplicates.size === 0) return;

    // Extract tag names before checking for "Duplicate: Steam"
    const updates = [...duplicates]
      .filter(
        (game) =>
          !(game.user_metadata?.tags ?? [])
            .map((tag) => tag.name)
            .includes(this.DUPLICATE_TAG),
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

    if (updates.length > 0) {
      // Batch update for better performance
      await Promise.all(
        updates.map((update) => this.gamesService.update(update.id, update)),
      );
    }
  }

  /**
   * Ensures required Steam configuration values are set before making API requests.
   */
  private validateSteamConfig(): void {
    if (!configuration.STEAM_API_KEY) {
      this.logger.error("Steam API key is not set.");
      throw new BadRequestException("Steam API key is not set.");
    }

    if (!configuration.STEAM_USER_ID) {
      this.logger.error("Steam User ID is not set.");
      throw new BadRequestException("Steam User ID is not set.");
    }
  }

  /**
   * Extracts the Steam App ID from Gamevault's metadata.
   * If a Steam store URL is found, the App ID is extracted using regex.
   */
  private extractSteamAppId(game: GamevaultGame): string | null {
    return (
      game.provider_metadata
        ?.flatMap((metadata) =>
          metadata.url_websites?.map(
            (url) => url.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1],
          ),
        )
        .find(Boolean) ?? null
    );
  }
}
