import { Module } from "@nestjs/common";
import {
  GameVaultPluginModule,
  GameVaultPluginModuleMetadataV1,
} from "../../../src/globals";
import { GamesModule } from "../../../src/modules/games/games.module";
import { SteamDupeFinderService } from "./steam-dupe-finder.service";

@Module({
  imports: [GamesModule],
  controllers: [],
  providers: [SteamDupeFinderService],
})
export default class SteamDupeFinderPluginModule
  implements GameVaultPluginModule
{
  metadata: GameVaultPluginModuleMetadataV1 = {
    name: "Steam Dupe Finder",
    author: "Alfagun74",
    version: "1.1.0",
    description:
      "Periodically logs games from your vault that are also present in your Steam library or wishlist.",
    keywords: ["steam", "duplicates"],
    license: "MIT",
  };
}
