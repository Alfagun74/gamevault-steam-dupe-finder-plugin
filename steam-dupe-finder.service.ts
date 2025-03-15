import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { Cron, Timeout } from "@nestjs/schedule";
import { kebabCase } from "lodash";
import { stringSimilarity } from "string-similarity-js";
import { GamesService } from "../../../src/modules/games/games.service";
import { GamevaultGame } from "../../../src/modules/games/gamevault-game.entity";
import configuration, { getCensoredConfiguration } from "./configuration";
import { GetOwnedGamesResponseWrapper, Game as SteamGame } from "./models";

@Injectable()
export class SteamDupeFinderService implements OnModuleInit {
  private readonly logger = new Logger(SteamDupeFinderService.name);

  constructor(private readonly gamesService: GamesService) {}

  onModuleInit() {
    this.logger.log({
      message: "Loaded Steam Dupe Finder Configuration.",
      configuration: getCensoredConfiguration(),
    });
  }

  @Timeout(60 * 1000)
  initialScan() {
    this.findDuplicates();
  }

  @Cron(`*/${configuration.INTERVAL} * * * *`, {
    disabled: configuration.INTERVAL <= 0,
  })
  public async findDuplicates(): Promise<Set<GamevaultGame>> {
    try {
      this.logger.log("Starting duplicate detection.");
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
      this.logger.log(`Found ${duplicates.size} possible duplicates.`);
      return duplicates;
    } catch (error) {
      this.logger.error("Error during duplicate detection", error);
    }
  }

  private async fetchSteamGames(): Promise<SteamGame[]> {
    this.validateSteamConfig();

    const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?include_appinfo=1&key=${configuration.STEAM_API_KEY}&steamid=${configuration.STEAM_USER_ID}&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      const errorMsg = `Steam API fetch failed with ${response.status}: ${response.statusText}`;
      this.logger.error(errorMsg);
      throw new BadRequestException(errorMsg);
    }

    const data: GetOwnedGamesResponseWrapper = await response.json();

    return data.response.games;
  }

  private async fetchGamevaultGames(): Promise<GamevaultGame[]> {
    return this.gamesService.find({
      loadRelations: true,
      loadDeletedEntities: false,
    });
  }

  private identifyDuplicateGames(
    gamevaultGames: GamevaultGame[],
    steamGames: SteamGame[],
  ): Set<GamevaultGame> {
    const duplicates = new Set<GamevaultGame>();

    const steamGameMap = new Map(
      steamGames.map((game) => [game.appid.toString(), game]),
    );

    for (const gamevaultGame of gamevaultGames) {
      const steamId = this.extractSteamAppId(gamevaultGame);
      if (steamId && steamGameMap.has(steamId)) {
        this.logger.log({
          message: "Found possible duplicate game via Steam ID.",
          gamevault_id: gamevaultGame.id,
          gamevault_title: gamevaultGame.title,
          steam_id: steamId,
          steam_title: steamGameMap.get(steamId).name,
        });
        duplicates.add(gamevaultGame);
        continue;
      }

      for (const steamGame of steamGames) {
        if (
          stringSimilarity(
            kebabCase(gamevaultGame.title),
            kebabCase(steamGame.name),
          ) > 0.9
        ) {
          this.logger.log({
            message: "Found possible duplicate game via title similarity.",
            gamevault_id: gamevaultGame.id,
            gamevault_title: gamevaultGame.title,
            steam_id: steamId,
            steam_title: steamGameMap.get(steamId).name,
          });
          duplicates.add(gamevaultGame);
          break;
        }
      }
    }
    return duplicates;
  }

  private validateSteamConfig(): void {
    if (!configuration.STEAM_API_KEY || !configuration.STEAM_USER_ID) {
      throw new BadRequestException("Steam API key or User ID not configured.");
    }
  }

  private extractSteamAppId(game: GamevaultGame): string | null {
    return (
      game.metadata?.url_websites
        ?.map((url) => url.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1])
        .find(Boolean) ?? null
    );
  }
}
