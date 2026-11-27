export interface CuratedArtistSeed {
  name: string;
  deezerId: number;
  itunesId?: number;
  genre: string;
  region: "IN" | "PK";
}

export interface CuratedPlaylistSeed {
  id: string;
  title: string;
  subtitle: string;
  gradient: string;
  category: "charts" | "bollywood" | "pakistan" | "punjabi" | "classics" | "mix";
  deezerPlaylistId?: string;
  targetCount: number;
  fallbackQueries: string[];
}

/**
 * Verified Indian & Pakistani artists with real Deezer/iTunes IDs so profiles,
 * HD portraits, top songs, and albums resolve accurately across regions.
 */
export const DESI_ARTIST_SEEDS: CuratedArtistSeed[] = [
  { name: "Arijit Singh", deezerId: 3830821, itunesId: 484568188, genre: "Bollywood • Soul", region: "IN" },
  { name: "Vishal Mishra", deezerId: 10575867, itunesId: 1159736220, genre: "Bollywood • Romantic", region: "IN" },
  { name: "Atif Aslam", deezerId: 405736, itunesId: 300187267, genre: "Pakistan • Bollywood", region: "PK" },
  { name: "Sonu Nigam", deezerId: 70075, itunesId: 18056658, genre: "Bollywood Classics", region: "IN" },
  { name: "Diljit Dosanjh", deezerId: 1199677, itunesId: 423087540, genre: "Punjabi • Pop", region: "IN" },
  { name: "Shreya Ghoshal", deezerId: 98371, genre: "Bollywood • Melody", region: "IN" },
  { name: "Rahat Fateh Ali Khan", deezerId: 126453, genre: "Sufi • Qawwali", region: "PK" },
  { name: "Karan Aujla", deezerId: 6555107, itunesId: 914892130, genre: "Punjabi • Urban", region: "IN" },
  { name: "Talha Anjum", deezerId: 68555722, itunesId: 1478621505, genre: "Pakistani Hip-Hop", region: "PK" },
  { name: "Jubin Nautiyal", deezerId: 8419888, genre: "Bollywood • Acoustic", region: "IN" },
  { name: "Pritam", deezerId: 290619, genre: "Bollywood Composer", region: "IN" },
  { name: "Kaifi Khalil", deezerId: 66567662, itunesId: 1508313978, genre: "Pakistan • Balochi Soul", region: "PK" },
  { name: "Anuv Jain", deezerId: 64116612, itunesId: 1388609753, genre: "Indian Indie", region: "IN" },
  { name: "Darshan Raval", deezerId: 6048770, genre: "Hindi Pop", region: "IN" },
  { name: "Nusrat Fateh Ali Khan", deezerId: 2907, itunesId: 465998, genre: "Qawwali Legend", region: "PK" },
  { name: "Mohit Chauhan", deezerId: 136941, genre: "Bollywood • Sufi Rock", region: "IN" },
  { name: "Alka Yagnik", deezerId: 76645, genre: "90s Bollywood", region: "IN" },
  { name: "Sachin-Jigar", deezerId: 1452924, genre: "Bollywood Hits", region: "IN" },
  { name: "Mithoon", deezerId: 4485080, genre: "Romantic Hindi", region: "IN" },
  { name: "Ankit Tiwari", deezerId: 5301812, genre: "Bollywood • Soul", region: "IN" },
  { name: "Vishal-Shekhar", deezerId: 7760, genre: "Bollywood Dance", region: "IN" },
  { name: "Himesh Reshammiya", deezerId: 2630, genre: "2000s Bollywood", region: "IN" },
  { name: "Jasleen Royal", deezerId: 5425304, genre: "Indie • Bollywood", region: "IN" },
];

/**
 * Curated India & Pakistan charts and playlists (50-100 tracks each).
 */
export const DESI_PLAYLIST_SEEDS: CuratedPlaylistSeed[] = [
  {
    id: "top-100-india",
    title: "Top 100 India",
    subtitle: "India's biggest hits & viral chartbusters right now",
    gradient: "from-[#0EA5E9] to-[#2563EB]",
    category: "charts",
    deezerPlaylistId: "15889926303",
    targetCount: 100,
    fallbackQueries: ["arijit singh", "vishal mishra", "karan aujla", "pritam", "anirudh", "diljit dosanjh", "jubin nautiyal", "badshah"],
  },
  {
    id: "hot-hits-pakistan",
    title: "Hot Hits Pakistan",
    subtitle: "Top Pakistani chartbusters, Indie & Urdu favorites",
    gradient: "from-[#1DB954] to-[#0D9488]",
    category: "pakistan",
    deezerPlaylistId: "11060635102",
    targetCount: 80,
    fallbackQueries: ["atif aslam", "kaifi khalil", "talha anjum", "hasan raheem", "abdul hannan", "asim azhar", "ali zafar", "bayaan"],
  },
  {
    id: "bollywood-hits",
    title: "Bollywood Hits",
    subtitle: "Arijit Singh, Vishal Mishra, Shreya Ghoshal & Pritam",
    gradient: "from-[#F97316] to-[#E11D48]",
    category: "bollywood",
    deezerPlaylistId: "15939809443",
    targetCount: 100,
    fallbackQueries: ["arijit singh", "vishal mishra", "shreya ghoshal", "pritam", "sachin jigar", "mohit chauhan"],
  },
  {
    id: "coke-studio-sufi",
    title: "Coke Studio Pakistan & Sufi",
    subtitle: "Coke Studio seasons, Rahat, NFAK, Atif Aslam & Qawwali",
    gradient: "from-[#10B981] to-[#047857]",
    category: "pakistan",
    deezerPlaylistId: "15957556723",
    targetCount: 85,
    fallbackQueries: ["coke studio pakistan", "rahat fateh ali khan", "nusrat fateh ali khan", "atif aslam tajdar", "shae gill pasoori", "abida parveen"],
  },
  {
    id: "punjabi-top",
    title: "Punjabi Top Charts",
    subtitle: "Diljit Dosanjh, Karan Aujla, Sidhu Moose Wala & Shubh",
    gradient: "from-[#EAB308] to-[#EA580C]",
    category: "punjabi",
    deezerPlaylistId: "10871902962",
    targetCount: 90,
    fallbackQueries: ["diljit dosanjh", "karan aujla", "sidhu moose wala", "shubh", "ap dhillon", "guru randhawa"],
  },
  {
    id: "hindi-romantic",
    title: "Bollywood Love & Romantic",
    subtitle: "Late-night romantic Hindi & Urdu melodies",
    gradient: "from-[#EC4899] to-[#8B5CF6]",
    category: "bollywood",
    deezerPlaylistId: "14668661281",
    targetCount: 90,
    fallbackQueries: ["arijit singh tum hi ho", "vishal mishra pehle bhi main", "atif aslam tere sang yaara", "jubin nautiyal", "mithoon", "kk"],
  },
  {
    id: "90s-2000s-bollywood",
    title: "90s & 2000s Evergreen Hindi",
    subtitle: "Sonu Nigam, KK, Kumar Sanu, Udit Narayan & Alka Yagnik",
    gradient: "from-[#6366F1] to-[#0EA5E9]",
    category: "classics",
    deezerPlaylistId: "15418901901",
    targetCount: 90,
    fallbackQueries: ["sonu nigam", "kk hindi", "udit narayan", "kumar sanu", "alka yagnik", "himesh reshammiya"],
  },
  {
    id: "pakistani-pop-2000s",
    title: "Pakistani Pop & Rock Classics",
    subtitle: "Strings, Jal, Atif Aslam, Ali Zafar & Noori",
    gradient: "from-[#14B8A6] to-[#2563EB]",
    category: "pakistan",
    deezerPlaylistId: "12527178583",
    targetCount: 65,
    fallbackQueries: ["jal band", "strings pakistan", "atif aslam doorie", "ali zafar", "bilal saeed", "falak shabir"],
  },
  {
    id: "desi-indie-hiphop",
    title: "Desi Indie & Hip-Hop",
    subtitle: "Talha Anjum, Anuv Jain, Hasan Raheem, Aditya Rikhari & Seedhe Maut",
    gradient: "from-[#8B5CF6] to-[#1DB954]",
    category: "mix",
    targetCount: 45,
    fallbackQueries: ["talha anjum", "anuv jain", "hasan raheem", "aditya rikhari", "young stunners", "seedhe maut", "prateek kuhad"],
  },
];

/** Rotating artist pools so Home recommendations feel fresh every launch/refresh. */
export const FRESH_DESI_QUERY_POOL = [
  ["arijit singh", "vishal mishra", "atif aslam", "anuv jain"],
  ["sonu nigam", "kk", "shreya ghoshal", "rahat fateh ali khan"],
  ["diljit dosanjh", "karan aujla", "talha anjum", "kaifi khalil"],
  ["jubin nautiyal", "darshan raval", "b praak", "hasan raheem"],
  ["pritam", "mohit chauhan", "ali zafar", "asim azhar"],
];
