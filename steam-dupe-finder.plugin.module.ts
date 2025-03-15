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
export default class SteamDupeFinderPluginModule implements GameVaultPluginModule {
  metadata: GameVaultPluginModuleMetadataV1 = {
    name: "Steam Dupe Finder",
    author: "Alfagun74",
    version: "1.0.0",
    description:
      "Checks & tags games if they are also available in your steam library.",
    keywords: ["steam", "duplicates"],
    license: "MIT",
  };
}
