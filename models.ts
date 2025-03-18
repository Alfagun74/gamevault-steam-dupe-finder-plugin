export interface GetOwnedGamesResponseWrapper {
  response: GetOwnedGamesResponse;
}

export interface GetOwnedGamesResponse {
  game_count: number;
  games: SteamGame[];
}

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url: string;
  has_community_visible_stats?: boolean;
  playtime_windows_forever: number;
  playtime_mac_forever: number;
  playtime_linux_forever: number;
  playtime_deck_forever: number;
  rtime_last_played: number;
  content_descriptorids?: number[];
  playtime_disconnected: number;
  has_leaderboards?: boolean;
  playtime_2weeks?: number;
}

export interface GetWishlistedGamesResponseWrapper {
  response: GetWishlistedGamesResponse;
}

export interface GetWishlistedGamesResponse {
  items: SteamWishlistItem[];
}

export interface SteamWishlistItem {
  appid: number;
  priority: number;
  date_added: number;
}
