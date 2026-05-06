/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Unlock, 
  Lock, 
  Activity, 
  MapPin, 
  Music, 
  Home as HomeIcon, 
  Search, 
  Library,
  Flame,
  CheckCircle2,
  Clock,
  Heart,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: string;
  cover: string;
  url: string;
  isLocked: boolean;
  bpm: number;
}

// --- Constants ---

const STEPS_PER_POINT = 100;
const POINTS_PER_SONG = 5;
const AD_REWARD_POINTS = 3;
const AD_DURATION_SEC = 30;

const SAMPLE_TRACKS: Track[] = [
  {
    id: '1',
    title: 'Neon Nights',
    artist: 'SyncWave',
    duration: '3:45',
    cover: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&h=300&auto=format&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    isLocked: false,
    bpm: 128
  },
  {
    id: '2',
    title: 'Midnight Dash',
    artist: 'Electra',
    duration: '2:58',
    cover: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=300&h=300&auto=format&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    isLocked: true,
    bpm: 140
  },
  {
    id: '3',
    title: 'Pulsar Pulse',
    artist: 'Velocity',
    duration: '4:12',
    cover: 'https://images.unsplash.com/photo-1514525253344-99a429994c4a?q=80&w=300&h=300&auto=format&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    isLocked: true,
    bpm: 165
  },
  {
    id: '4',
    title: 'Electric Sprint',
    artist: 'Volt',
    duration: '3:20',
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300&h=300&auto=format&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    isLocked: true,
    bpm: 155
  },
  {
    id: '5',
    title: 'Glitch Runner',
    artist: 'CyberCore',
    duration: '3:50',
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=300&h=300&auto=format&fit=crop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    isLocked: true,
    bpm: 172
  }
];

// --- Utilities ---

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// --- Components ---

export default function App() {
  const [activeView, setActiveView] = useState<'home' | 'search' | 'library' | 'run' | 'profile'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [tracks, setTracks] = useState<Track[]>(() => {
    const saved = localStorage.getItem('tempo_tracks');
    return saved ? JSON.parse(saved) : SAMPLE_TRACKS;
  });
  
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalSteps, setTotalSteps] = useState(0);
  const [points, setPoints] = useState(0);
  const [isUnlockedMode, setIsUnlockedMode] = useState(false);
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  
  // Ad state
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const watcherRef = useRef<number | null>(null);

  const currentTrack = tracks[currentTrackIndex];

  // Save progress
  useEffect(() => {
    localStorage.setItem('tempo_tracks', JSON.stringify(tracks));
  }, [tracks]);

  // Handle music player
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying && !currentTrack.isLocked) {
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  const toggleTracking = () => {
    if (isTracking) {
      if (watcherRef.current) navigator.geolocation.clearWatch(watcherRef.current);
      setIsTracking(false);
    } else {
      if (!navigator.geolocation) {
        alert("Geolocation not supported");
        return;
      }
      setIsTracking(true);
      watcherRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (lastCoords) {
            const dist = calculateDistance(lastCoords.lat, lastCoords.lng, latitude, longitude);
            if (dist > 1) {
              // Assume 1 meter ≈ 1.3 steps for a run/fast walk
              setTotalSteps(prev => prev + Math.round(dist * 1.3));
            }
          }
          setLastCoords({ lat: latitude, lng: longitude });
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
    }
  };

  const incrementMockSteps = () => {
    setTotalSteps(prev => prev + 50);
  };

  const startWatchingAd = () => {
    if (isWatchingAd) return;
    setIsWatchingAd(true);
    setAdTimer(AD_DURATION_SEC);
  };

  // Handle Ad Timer
  useEffect(() => {
    let interval: number | null = null;
    if (isWatchingAd && adTimer > 0) {
      interval = window.setInterval(() => {
        setAdTimer(prev => prev - 1);
      }, 1000);
    } else if (isWatchingAd && adTimer === 0) {
      setIsWatchingAd(false);
      setPoints(prev => prev + AD_REWARD_POINTS);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isWatchingAd, adTimer]);

  // Convert Steps to Points
  useEffect(() => {
    if (totalSteps >= STEPS_PER_POINT) {
      const newPoints = Math.floor(totalSteps / STEPS_PER_POINT);
      setPoints(prev => prev + newPoints);
      setTotalSteps(prev => prev % STEPS_PER_POINT);
    }
  }, [totalSteps]);

  // Check for unlocks using points
  useEffect(() => {
    const nextLocked = tracks.find(t => t.isLocked);
    if (nextLocked && points >= POINTS_PER_SONG) {
      setTracks(prev => {
        const next = [...prev];
        const index = next.findIndex(t => t.id === nextLocked.id);
        if (index !== -1) {
          next[index] = { ...next[index], isLocked: false };
        }
        return next;
      });
      setPoints(prev => prev - POINTS_PER_SONG);
      setIsUnlockedMode(true);
      setTimeout(() => setIsUnlockedMode(false), 3000);
    }
  }, [points, tracks]);

  const handleNext = () => {
    setCurrentTrackIndex(prev => (prev + 1) % tracks.length);
  };

  const handlePrev = () => {
    setCurrentTrackIndex(prev => (prev - 1 + tracks.length) % tracks.length);
  };

  const progressPercent = Math.min(points / POINTS_PER_SONG, 1);
  const dashOffset = 282.7 * (1 - progressPercent);

  return (
    <div className="relative flex flex-col h-screen overflow-hidden text-white font-sans bg-deep-space selection:bg-neon-green selection:text-black">
      <div className="atmosphere" />

      {/* --- Main Content Container (Responsive) --- */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* --- Sidebar (Desktop Only) --- */}
        <aside className="hidden md:flex w-72 flex-col glass border-r border-white/5 p-8 space-y-10 z-10">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-neon-green rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(57,255,20,0.4)]">
              <Activity className="w-6 h-6 text-black" />
            </div>
            <span className="text-2xl font-black tracking-tighter font-display italic">STRIDE</span>
          </div>

          <nav className="flex-1 space-y-8">
            <div className="space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-black">Discovery</p>
              <div className="space-y-2">
                <div 
                  onClick={() => setActiveView('home')}
                  className={`flex items-center space-x-4 font-bold cursor-pointer transition-colors ${activeView === 'home' ? 'text-neon-green' : 'text-white/50 hover:text-white'}`}
                >
                  <HomeIcon className="w-5 h-5 opacity-80" />
                  <span>Home</span>
                </div>
                <div 
                  onClick={() => setActiveView('search')}
                  className={`flex items-center space-x-4 font-bold cursor-pointer transition-colors ${activeView === 'search' ? 'text-neon-green' : 'text-white/50 hover:text-white'}`}
                >
                  <Search className="w-5 h-5 opacity-80" />
                  <span>Search</span>
                </div>
                <div 
                  onClick={() => setActiveView('run')}
                  className={`flex items-center space-x-4 font-bold cursor-pointer transition-colors ${activeView === 'run' ? 'text-neon-green' : 'text-white/50 hover:text-white'}`}
                >
                  <Activity className="w-5 h-5 opacity-80" />
                  <span>Run Session</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-black">Collection</p>
              <div className="space-y-2">
                 <div 
                  onClick={() => setActiveView('library')}
                  className={`flex items-center space-x-4 font-bold cursor-pointer transition-colors ${activeView === 'library' ? 'text-neon-green' : 'text-white/50 hover:text-white'}`}
                >
                  <Library className="w-5 h-5 opacity-80" />
                  <span>Library</span>
                </div>
              </div>
            </div>
          </nav>

          {/* Improved Run Stat Box */}
          <div className="mt-auto p-5 rounded-3xl run-stat-box border border-neon-green/20 backdrop-blur-md">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-neon-green uppercase font-black tracking-wider">Current Lap</p>
              {isTracking && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>}
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-3xl font-black font-display">{points}</p>
              <p className="text-xs text-white/40 font-bold">Points</p>
            </div>
            <div className="text-[10px] text-white/30 font-medium mb-2">
              Next point: {totalSteps}/{STEPS_PER_POINT} steps
            </div>
            <div className="w-full bg-white/10 h-1.5 mt-1 rounded-full overflow-hidden">
              <motion.div 
                 animate={{ width: `${progressPercent * 100}%` }}
                 className="bg-neon-green h-full rounded-full shadow-[0_0_10px_#39FF14]"
              />
            </div>
            <button 
              onClick={toggleTracking}
              className={`w-full mt-4 py-3 rounded-2xl text-xs font-black tracking-widest transition-all ${
                isTracking 
                ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                : 'bg-neon-green text-black hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              {isTracking ? 'PAUSE SESSION' : 'START RUN'}
            </button>
            
            <div className="mt-4 pt-4 border-t border-white/5">
               <button 
                 onClick={startWatchingAd}
                 disabled={isWatchingAd}
                 className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
               >
                 <Play className="w-3 h-3 text-neon-green" />
                 Watch Ad (+3 pts)
               </button>
            </div>
          </div>
        </aside>

        {/* --- Main Content Area --- */}
        <main className="flex-1 flex flex-col p-6 md:p-10 overflow-hidden relative z-0 overflow-y-auto custom-scrollbar">
          {activeView === 'home' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col">
              {/* Mobile Header */}
              <header className="flex justify-between items-center mb-8 md:mb-12">
                <div className="md:hidden flex items-center space-x-2">
                  <div className="w-8 h-8 bg-neon-green rounded-lg flex items-center justify-center">
                      <Activity className="w-5 h-5 text-black" />
                  </div>
                  <span className="text-xl font-black font-display tracking-tighter">STRIDE</span>
                </div>
                <div className="hidden md:block">
                  <h1 className="text-4xl font-light mb-1">Good morning, <span className="font-black text-white">Glazyl</span></h1>
                  <p className="text-white/40 text-sm">Ready to blast through 1km today?</p>
                </div>
                <div className="flex items-center space-x-4 md:space-x-6">
                  <div className="hidden md:block text-right">
                    <p className="text-[10px] text-white/40 uppercase font-black tracking-tighter">Current Pace</p>
                    <p className="font-mono text-xl text-neon-green">4'58" /km</p>
                  </div>
                  <div 
                    onClick={() => setActiveView('profile')}
                    className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl glass border-white/20 p-0.5 md:p-1 cursor-pointer hover:border-neon-green/40 transition-colors"
                  >
                    <div className="w-full h-full rounded-lg md:rounded-xl bg-gradient-to-br from-neon-green/10 to-blue-500/10 flex items-center justify-center overflow-hidden">
                      <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" alt="avatar" className="w-full h-full" />
                    </div>
                  </div>
                </div>
              </header>

              <div className="flex flex-col xl:flex-row space-y-10 xl:space-y-0 xl:space-x-12 items-center xl:items-start">
                {/* Circular Progress Ring */}
                <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 flex-shrink-0 flex items-center justify-center">
                  <svg className="progress-ring w-full h-full" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" stroke="rgba(255,255,255,0.05)" strokeWidth="4" fill="transparent" />
                    <motion.circle 
                      cx="50" cy="50" r="45" stroke="#39FF14" strokeWidth="4" fill="transparent" strokeDasharray="282.7" 
                      animate={{ strokeDashoffset: dashOffset }}
                      transition={{ type: "spring", stiffness: 50, damping: 20 }}
                      strokeLinecap="round" className="drop-shadow-[0_0_12px_rgba(57,255,20,0.6)]" 
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="text-[10px] md:text-sm text-white/40 uppercase tracking-[0.2em] font-black">Next Reward</p>
                    <p className="text-6xl md:text-8xl font-black neon-glow font-display leading-none">
                      {Math.max(POINTS_PER_SONG - points, 0).toFixed(0)}<span className="text-xl md:text-2xl ml-1 font-medium font-sans">pts</span>
                    </p>
                    <p className="text-[10px] md:text-sm text-neon-green mt-2 md:mt-4 font-bold tracking-wide">To Unlock Next Song</p>
                  </div>
                </div>

                {/* List Section */}
                <div className="flex-1 flex flex-col h-full w-full">
                  {/* Unlocks and Ads Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                      <div className="glass p-6 md:p-8 rounded-[2rem] relative overflow-hidden group border-neon-green/20">
                        <div className="flex items-center space-x-4 md:space-x-8">
                          <div className="w-20 h-20 md:w-28 md:h-28 bg-white/5 rounded-2xl overflow-hidden shadow-2xl relative flex-shrink-0">
                            <img src={tracks.find(t => t.isLocked)?.cover} alt="" className="w-full h-full object-cover grayscale opacity-50 transition-all group-hover:scale-110" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Lock className="w-6 h-6 md:w-8 md:h-8 text-white/40" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-3 mb-2">
                              <span className="px-2 py-0.5 bg-neon-green text-black text-[8px] md:text-[9px] font-black rounded">LOCKED</span>
                              <span className="text-[9px] md:text-[10px] text-white/40 font-black uppercase tracking-widest hidden md:block">Next Reward</span>
                            </div>
                            <h2 className="text-xl md:text-2xl font-black truncate">{tracks.find(t => t.isLocked)?.title || "ALL UNLOCKED"}</h2>
                            <p className="text-sm text-white/60 font-medium">Earn { Math.max(POINTS_PER_SONG - points, 0) } more points</p>
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 h-1.5 bg-neon-green/30 w-full">
                          <motion.div 
                            animate={{ width: `${progressPercent * 100}%` }}
                            className="h-full bg-neon-green shadow-[0_0_10px_#39FF14]"
                          />
                        </div>
                      </div>

                      {/* Advertisement Section */}
                      <div className="glass p-6 md:p-8 rounded-[2rem] border-white/5 flex flex-col justify-between group hover:border-neon-green/20 transition-all cursor-pointer overflow-hidden relative" onClick={startWatchingAd}>
                        <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Play className="w-24 h-24 text-neon-green fill-current" />
                        </div>
                        <div className="relative z-10">
                          <div className="flex items-center space-x-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                              <Music className="w-4 h-4 text-neon-green" />
                            </div>
                            <span className="text-[10px] font-black tracking-widest uppercase text-white/40">Watch & Earn</span>
                          </div>
                          <h3 className="text-2xl font-black">Get 3 Points</h3>
                          <p className="text-sm text-white/50 mt-1">Watch a 30s ad to speed up unlocks</p>
                        </div>
                        <button className="relative z-10 self-start mt-6 px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest group-hover:bg-neon-green group-hover:text-black transition-all">
                          Start Viewing
                        </button>
                      </div>
                  </div>

                  <div className="flex-1 space-y-3 pb-32 md:pb-0">
                      <p className="text-[10px] font-black uppercase text-white/40 tracking-widest mb-2">Ready Mix</p>
                      {tracks.filter(t => !t.isLocked).slice(0, 5).map((track, index) => (
                        <div 
                          key={track.id}
                          onClick={() => setCurrentTrackIndex(tracks.indexOf(track))}
                          className={`glass p-4 md:p-5 rounded-2xl flex items-center space-x-4 md:space-x-6 border-white/5 transition-all hover:bg-white/5 cursor-pointer ${
                            track.id === currentTrack.id ? 'border-neon-green/40 bg-neon-green/10' : ''
                          }`}
                        >
                          <div className="w-5 text-[10px] text-white/40 font-black">{index + 1}</div>
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden shadow-xl flex-shrink-0">
                            <img src={track.cover} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs md:text-sm font-black truncate ${track.id === currentTrack.id ? 'text-neon-green' : 'text-white'}`}>{track.title}</p>
                            <p className="text-[10px] md:text-xs text-white/40 font-medium">{track.artist}</p>
                          </div>
                          <span className="text-[10px] text-white/20 font-mono">{track.duration}</span>
                        </div>
                      ))}
                      <button 
                         onClick={() => setActiveView('library')}
                         className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                      >
                         View Full Library
                      </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeView === 'search' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col h-full">
               <h2 className="text-3xl font-black mb-8">Discover Tracks</h2>
               <div className="relative mb-10">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input 
                    type="text" 
                    placeholder="Search artist, genre, or mood..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-[2rem] py-6 pl-16 pr-8 text-xl font-bold focus:outline-none focus:border-neon-green/40 transition-all placeholder:text-white/20"
                  />
               </div>
               <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-4">
                  {tracks.filter(t => 
                    t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    t.artist.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((track, index) => (
                    <div 
                      key={track.id}
                      onClick={() => !track.isLocked && setCurrentTrackIndex(tracks.indexOf(track))}
                      className={`glass p-5 rounded-2xl flex items-center space-x-6 border-white/5 transition-all hover:bg-white/5 cursor-pointer relative group ${
                        track.id === currentTrack.id ? 'border-neon-green/40 bg-neon-green/10' : ''
                      } ${track.isLocked ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                    >
                      <div className="w-16 h-16 rounded-xl overflow-hidden shadow-xl flex-shrink-0">
                        <img src={track.cover} alt="" className="w-full h-full object-cover" />
                        {track.isLocked && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Lock className="w-6 h-6 text-white" /></div>}
                      </div>
                      <div className="flex-1">
                        <p className={`text-lg font-black truncate ${track.id === currentTrack.id ? 'text-neon-green' : 'text-white'}`}>{track.title}</p>
                        <p className="text-sm text-white/40 font-medium">{track.artist}</p>
                      </div>
                      <div className="hidden group-hover:flex items-center space-x-4">
                         <span className="text-[10px] uppercase font-black tracking-widest text-white/20">Genre: Future</span>
                         <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center">
                            <Play className="w-4 h-4 fill-current" />
                         </div>
                      </div>
                    </div>
                  ))}
               </div>
            </motion.div>
          )}

          {activeView === 'library' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col h-full">
               <div className="flex justify-between items-center mb-10">
                  <h2 className="text-3xl font-black">Your Collection</h2>
                  <div className="px-4 py-2 bg-neon-green/10 border border-neon-green/20 rounded-xl">
                     <span className="text-[10px] font-black uppercase text-neon-green">{tracks.filter(t => !t.isLocked).length} Tracks Unlocked</span>
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto custom-scrollbar pr-4 pb-20">
                  {tracks.filter(t => !t.isLocked).map(track => (
                    <motion.div 
                      key={track.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setCurrentTrackIndex(tracks.indexOf(track))}
                      className={`glass p-4 rounded-3xl border border-white/5 cursor-pointer relative overflow-hidden group ${track.id === currentTrack.id ? 'border-neon-green/40' : ''}`}
                    >
                       <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                       <img src={track.cover} className="w-full aspect-square object-cover rounded-2xl mb-4 group-hover:scale-110 transition-transform duration-500" alt="" />
                       <div className="relative z-20">
                          <p className="font-black text-lg truncate mb-1">{track.title}</p>
                          <p className="text-xs text-white/40 italic">{track.artist}</p>
                       </div>
                       <button className="absolute right-6 bottom-6 z-20 w-12 h-12 bg-neon-green rounded-full flex items-center justify-center text-black opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                          <Play className="w-5 h-5 fill-current" />
                       </button>
                    </motion.div>
                  ))}
               </div>
            </motion.div>
          )}

          {activeView === 'run' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col h-full items-center justify-center text-center">
               <div className="relative mb-12">
                  <motion.div 
                    animate={{ scale: isTracking ? [1, 1.05, 1] : 1 }} 
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-80 h-80 md:w-[450px] md:h-[450px] rounded-full border-8 border-white/5 flex flex-col items-center justify-center relative overflow-hidden"
                  >
                     <div className="atmosphere opacity-30" />
                     <p className="text-sm md:text-xl text-white/40 uppercase tracking-[0.3em] font-black mb-4">Total Steps</p>
                     <p className="text-8xl md:text-[180px] font-black neon-glow font-display leading-none leading-none">{totalSteps + (points * STEPS_PER_POINT)}</p>
                     <p className="text-lg md:text-2xl text-neon-green mt-4 font-bold tracking-widest">{points} Earned Points</p>
                     
                     <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <motion.circle 
                          cx="50%" cy="50%" r="48%" 
                          stroke="#39FF14" strokeWidth="8" fill="transparent"
                          strokeDasharray="1413"
                          animate={{ strokeDashoffset: 1413 * (1 - (totalSteps % STEPS_PER_POINT) / STEPS_PER_POINT) }}
                        />
                     </svg>
                  </motion.div>
               </div>

               <div className="flex flex-col md:flex-row gap-6 w-full max-w-2xl">
                  <div className="flex-1 glass p-8 rounded-[2.5rem] border-white/10">
                     <p className="text-[10px] text-white/40 uppercase font-black mb-1">Step Goal</p>
                     <p className="text-3xl font-black">{totalSteps % STEPS_PER_POINT} / {STEPS_PER_POINT}</p>
                     <p className="text-xs text-neon-green mt-2 font-bold uppercase tracking-wider">Next Point</p>
                  </div>
                  <div className="flex-1 glass p-8 rounded-[2.5rem] border-white/10">
                     <p className="text-[10px] text-white/40 uppercase font-black mb-1">Goal Points</p>
                     <p className="text-3xl font-black">{points} / {POINTS_PER_SONG}</p>
                     <p className="text-xs text-neon-green mt-2 font-bold uppercase tracking-wider">Next Song</p>
                  </div>
               </div>

               <button 
                 onClick={toggleTracking}
                 className={`mt-12 px-20 py-8 rounded-[3rem] text-2xl font-black tracking-widest transition-all ${
                   isTracking 
                   ? 'bg-red-500/10 text-red-500 border-4 border-red-500/20' 
                   : 'bg-neon-green text-black shadow-[0_0_50px_rgba(57,255,20,0.4)] hover:scale-105 active:scale-95'
                 }`}
               >
                 {isTracking ? 'PAUSE SESSION' : 'START RUNNING'}
               </button>

               {/* Advertisement Boost Section (Bottom Corner) */}
               <div className="absolute bottom-10 right-10 hidden xl:block">
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    onClick={startWatchingAd}
                    className="glass p-6 rounded-3xl border-neon-green/20 w-64 text-left cursor-pointer group relative overflow-hidden"
                  >
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                       <Play className="w-24 h-24 text-neon-green fill-current" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Point Boost</span>
                      </div>
                      <h4 className="text-lg font-black leading-tight">Watch Ad for<br /><span className="text-neon-green">+3 Points</span></h4>
                      <div className="mt-4 flex items-center gap-1 text-[9px] font-black uppercase text-neon-green">
                         <span>Go Fast</span> <SkipForward className="w-3 h-3" />
                      </div>
                    </div>
                  </motion.div>
               </div>
            </motion.div>
          )}

          {activeView === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-full max-w-4xl mx-auto w-full">
               <div className="flex flex-col items-center mb-12 text-center">
                  <div className="w-32 h-32 md:w-48 md:h-48 rounded-[2rem] glass p-1 border-white/10 mb-6 group relative">
                    <div className="w-full h-full rounded-[1.5rem] bg-gradient-to-br from-neon-green/20 to-blue-600/20 flex items-center justify-center overflow-hidden relative">
                       <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" alt="avatar" className="w-full h-full group-hover:scale-110 transition-transform duration-700" />
                    </div>
                  </div>
                  <h2 className="text-4xl font-black mb-2">Glazyl Alicaway</h2>
                  <p className="text-neon-green font-bold tracking-widest uppercase text-xs">A-Tier Runner • Level 14</p>
               </div>

               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                  <div className="glass p-6 rounded-3xl border-white/5 text-center">
                     <p className="text-[10px] text-white/40 uppercase font-black mb-1">Total Steps</p>
                     <p className="text-xl font-black">{totalSteps + (points * STEPS_PER_POINT) + 124500}</p>
                  </div>
                  <div className="glass p-6 rounded-3xl border-white/5 text-center">
                     <p className="text-[10px] text-white/40 uppercase font-black mb-1">Points Earned</p>
                     <p className="text-xl font-black text-neon-green">{points + 42}</p>
                  </div>
                  <div className="glass p-6 rounded-3xl border-white/5 text-center">
                     <p className="text-[10px] text-white/40 uppercase font-black mb-1">Unlocks</p>
                     <p className="text-xl font-black">{tracks.filter(t => !t.isLocked).length}</p>
                  </div>
                  <div className="glass p-6 rounded-3xl border-white/5 text-center">
                     <p className="text-[10px] text-white/40 uppercase font-black mb-1">Daily Streak</p>
                     <p className="text-xl font-black">4 Days</p>
                  </div>
               </div>

               <div className="space-y-6">
                  <h3 className="text-xl font-black px-2">Account Settings</h3>
                  <div className="glass rounded-[2rem] border-white/5 divide-y divide-white/5 overflow-hidden">
                     <div className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer group">
                        <div className="flex items-center gap-4">
                           <MapPin className="w-5 h-5 text-white/40 group-hover:text-neon-green" />
                           <span className="font-bold">Location Preferences</span>
                        </div>
                        <SkipForward className="w-4 h-4 opacity-20" />
                     </div>
                     <div className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer group">
                        <div className="flex items-center gap-4">
                           <Activity className="w-5 h-5 text-white/40 group-hover:text-neon-green" />
                           <span className="font-bold">Step Tracking Sensitivity</span>
                        </div>
                        <SkipForward className="w-4 h-4 opacity-20" />
                     </div>
                     <div className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer group text-red-500">
                        <div className="flex items-center gap-4">
                           <Unlock className="w-5 h-5 opacity-40 group-hover:opacity-100" />
                           <span className="font-bold">Sign Out</span>
                        </div>
                     </div>
                  </div>
               </div>
            </motion.div>
          )}

          {/* Dev Utils for Testing (Hidden deep) */}
          <div className="mt-auto pt-20">
             <button 
                onClick={incrementMockSteps}
                className="opacity-0 hover:opacity-10 transition-opacity text-[8px] uppercase font-black"
              >
                Cheat: 50 Steps
              </button>
          </div>
        </main>
      </div>

      {/* --- Responsive Player Bar --- */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 md:px-10 pb-4 md:pb-8 flex flex-col gap-2">
         {/* Mini Now Playing (Mobile) / Full Bar (Desktop) */}
         <footer className="h-20 md:h-28 glass rounded-[1.5rem] md:rounded-[2.5rem] px-4 md:px-10 flex items-center justify-between md:space-x-12 border-white/10 shadow-2xl backdrop-blur-3xl">
          <div className="flex items-center space-x-3 md:space-x-6 w-3/4 md:w-72">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-neon-green rounded-xl md:rounded-2xl shadow-[0_0_20px_rgba(57,255,20,0.3)] flex items-center justify-center text-black font-black overflow-hidden relative flex-shrink-0">
              <img src={currentTrack.cover} alt="" className={`w-full h-full object-cover ${isPlaying ? 'animate-[pulse_4s_infinite]' : ''}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] md:text-sm font-black text-white truncate">{currentTrack.title}</p>
              <p className="text-[8px] md:text-xs text-white/40 font-medium truncate italic leading-none">{currentTrack.artist}</p>
            </div>
          </div>

          <div className="hidden md:flex flex-1 flex-col items-center space-y-4">
            <div className="flex items-center space-x-10">
              <button 
                onClick={handlePrev}
                className="opacity-40 hover:opacity-100 transition-opacity transform active:scale-90"
              >
                <SkipBack className="w-6 h-6" />
              </button>
              <button 
                onClick={() => !currentTrack.isLocked && setIsPlaying(!isPlaying)}
                className={`w-14 h-14 rounded-full bg-white text-black flex items-center justify-center text-xl pl-1 shadow-2xl transition-transform hover:scale-110 active:scale-95 ${currentTrack.isLocked ? 'opacity-20 cursor-not-allowed' : ''}`}
              >
                {isPlaying && !currentTrack.isLocked ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current" />}
              </button>
              <button 
                onClick={handleNext}
                className="opacity-40 hover:opacity-100 transition-opacity transform active:scale-90"
              >
                <SkipForward className="w-6 h-6" />
              </button>
            </div>
            
            <div className="w-full max-w-lg flex items-center space-x-4 text-[10px] text-white/30 font-mono tracking-tighter">
              <span>0:00</span>
              <div className="flex-1 h-[3px] bg-white/10 rounded-full overflow-hidden cursor-pointer group">
                <div className="bg-white group-hover:bg-neon-green h-full w-1/3 transition-colors shadow-[0_0_5px_white]" />
              </div>
              <span>{currentTrack.duration}</span>
            </div>
          </div>

          {/* Quick Play/Pause for Mobile */}
          <div className="md:hidden flex space-x-4">
             <button 
                onClick={() => !currentTrack.isLocked && setIsPlaying(!isPlaying)} 
                className="w-10 h-10 rounded-full glass border-white/20 flex items-center justify-center"
              >
                {isPlaying && !currentTrack.isLocked ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current pl-0.5" />}
              </button>
              <button onClick={handleNext} className="w-10 h-10 rounded-full glass border-white/20 flex items-center justify-center">
                 <SkipForward className="w-5 h-5" />
              </button>
          </div>

          <div className="hidden md:flex w-72 justify-end items-center space-x-6">
             <div className="flex flex-col items-end">
                <span className="text-[9px] text-white/30 font-black tracking-widest leading-none">GPS ACTIVE</span>
                <div className="flex space-x-1 items-end h-4 mt-1">
                  <div className="w-1.5 bg-neon-green h-1 rounded-sm"></div>
                  <div className="w-1.5 bg-neon-green h-2 rounded-sm shadow-[0_0_5px_#39FF14]"></div>
                  <div className="w-1.5 bg-neon-green/40 h-3 rounded-sm"></div>
                  <div className="w-1.5 bg-neon-green/20 h-4 rounded-sm"></div>
                </div>
             </div>
             <div className="w-px h-10 bg-white/10" />
             <div className="w-10 h-10 rounded-full glass flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors">
                <MapPin className="w-5 h-5 opacity-40 hover:opacity-100" />
             </div>
          </div>
        </footer>

        {/* Mobile Nav Bar */}
        <nav className="md:hidden h-16 glass rounded-2xl flex items-center justify-around px-2 border-white/5">
           <div 
            onClick={() => setActiveView('home')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'home' ? 'text-neon-green' : 'text-white/30'}`}
          >
              <HomeIcon className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">Home</span>
           </div>
           <div 
            onClick={() => setActiveView('search')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'search' ? 'text-neon-green' : 'text-white/30'}`}
          >
              <Search className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">Search</span>
           </div>
           <div 
            onClick={() => setActiveView('library')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'library' ? 'text-neon-green' : 'text-white/30'}`}
          >
              <Library className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">Library</span>
           </div>
           <div 
            onClick={() => setActiveView('run')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'run' ? 'text-neon-green' : 'text-white/30'}`}
          >
              <Activity className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest">Run</span>
           </div>
        </nav>
      </div>

      {/* Ad Overlay Sim */}
      <AnimatePresence>
        {isWatchingAd && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="atmosphere opacity-20" />
            <div className="w-20 h-20 bg-neon-green/20 rounded-3xl flex items-center justify-center mb-8">
               <Play className="w-10 h-10 text-neon-green animate-pulse" />
            </div>
            <h2 className="text-3xl font-black font-display mb-2">SPONSORED AD</h2>
            <p className="text-white/40 text-sm max-w-xs mb-10 italic">
              Experience the future of sound. This advertisement helps keep Tempo Beats free for the community.
            </p>
            
            <div className="relative w-24 h-24 flex items-center justify-center">
               <svg className="w-full h-full rotate-[-90deg]">
                  <circle cx="48" cy="48" r="40" stroke="white" strokeWidth="2" fill="transparent" strokeOpacity="0.1" />
                  <motion.circle 
                    cx="48" cy="48" r="40" stroke="#39FF14" strokeWidth="4" fill="transparent" 
                    strokeDasharray="251.2" 
                    animate={{ strokeDashoffset: 251.2 * (1 - adTimer / AD_DURATION_SEC) }}
                  />
               </svg>
               <span className="absolute text-2xl font-black font-mono">{adTimer}s</span>
            </div>
            <p className="mt-8 text-xs font-black uppercase tracking-widest text-white/20">Rewarding {AD_REWARD_POINTS} Points soon...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unlocked Toast */}
      <AnimatePresence>
        {isUnlockedMode && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className="absolute top-10 left-1/2 -translate-x-1/2 glass border-neon-green/40 text-white px-6 py-4 rounded-3xl flex items-center gap-4 font-black shadow-[0_0_50px_rgba(57,255,20,0.5)] z-[100] border-2 w-[90%] md:w-auto"
          >
            <div className="w-10 h-10 bg-neon-green rounded-xl flex items-center justify-center flex-shrink-0">
               <Unlock className="w-5 h-5 text-black" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-60">Reward Earned</p>
              <p className="text-sm md:text-xl">NEW TRACK UNLOCKED</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <audio 
        ref={audioRef}
        src={currentTrack.url}
        onEnded={handleNext}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );
}

