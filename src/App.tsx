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
    title: 'Love Like U',
    artist: 'Ashtine Olviga',
    duration: '2:57',
    cover: 'https://images.genius.com/09f580e348cb09c3443582e525cca603.640x640x1.jpg',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    isLocked: false,
    bpm: 128
  },
  {
    id: '2',
    title: 'Manchild',
    artist: 'Sabrina Carpenter',
    duration: '3:33',
    cover: 'https://images.genius.com/5b099a4fe7bc649900fd54fd4dd747f9.1000x1000x1.png',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    isLocked: true,
    bpm: 140
  },
  {
    id: '3',
    title: 'Stateside + Zara Larsson',
    artist: 'PinkPantheress, Zara Larsson',
    duration: '3:04',
    cover: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/b0/d2/bb/b0d2bb76-41a2-1bb1-586c-107b63e4181d/5026854077819.jpg/72x72bb.jpg',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    isLocked: true,
    bpm: 165
  },
  {
    id: '4',
    title: 'party 4 u',
    artist: 'Charli xcx',
    duration: '4:56',
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
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [tracks, setTracks] = useState<Track[]>(() => {
    const saved = localStorage.getItem('stride_tracks_v2');
    if (!saved) {
      // Force reset to SAMPLE_TRACKS to ensure user's lock request is honored
      return SAMPLE_TRACKS;
    }
    
    try {
      const parsed = JSON.parse(saved) as Track[];
      return SAMPLE_TRACKS.map(sample => {
        const savedTrack = parsed.find(t => t.id === sample.id);
        return savedTrack ? { ...sample, isLocked: savedTrack.isLocked } : sample;
      });
    } catch (e) {
      return SAMPLE_TRACKS;
    }
  });
  
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [songDuration, setSongDuration] = useState(0);
  const [totalSteps, setTotalSteps] = useState(() => {
    const saved = localStorage.getItem('stride_tracks_v2');
    return saved ? Number(localStorage.getItem('stride_steps') || 0) : 0;
  });
  const [points, setPoints] = useState(() => {
    const saved = localStorage.getItem('stride_tracks_v2');
    return saved ? Number(localStorage.getItem('stride_points') || 0) : 0;
  });
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
    localStorage.setItem('stride_tracks_v2', JSON.stringify(tracks));
    localStorage.setItem('stride_points', points.toString());
    localStorage.setItem('stride_steps', totalSteps.toString());
  }, [tracks, points, totalSteps]);

  // Handle music player
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setSongDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      handleNext();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    if (isPlaying && !currentTrack.isLocked) {
      audio.play().catch(e => console.error("Playback failed", e));
    } else {
      audio.pause();
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isPlaying, currentTrack]);

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden text-white font-sans bg-[#020202] py-8 selection:bg-neon-green selection:text-black">
      {/* --- Ambient Background --- */}
      <div className="atmosphere fixed inset-0 z-0 opacity-40" />

      {/* --- iPhone Device Frame --- */}
      <div className="relative w-[390px] h-[844px] shrink-0 bg-deep-space rounded-[3.5rem] border-[8px] border-[#1a1a1a] shadow-[0_0_0_2px_#333,0_50px_100px_-20px_rgba(0,0,0,0.8)] z-10 flex flex-col overflow-hidden">
        
        {/* --- Dynamic Island --- */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full pt-4 flex justify-center z-[100] pointer-events-none">
          <motion.div 
            layout
            initial={{ width: 120, height: 35 }}
            animate={{ 
              width: (isPlaying || isTracking) ? 200 : 120,
              height: (isPlaying || isTracking) ? 35 : 35
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="bg-black rounded-[2rem] flex items-center justify-between px-4 overflow-hidden relative shadow-2xl"
          >
            {/* Left side info (Active Activity) */}
            <AnimatePresence mode="wait">
              {isTracking ? (
                <motion.div key="tracking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                  <Activity className="w-3 h-3 text-neon-green" />
                  <span className="text-[10px] font-black text-neon-green">{totalSteps + (points * STEPS_PER_POINT)}</span>
                </motion.div>
              ) : (
                <motion.div key="idle-l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-4" />
              )}
            </AnimatePresence>

            {/* Middle (Dynamic Island Shape) */}
            <div className="w-16 h-8 bg-black rounded-full" />

            {/* Right side info (Now Playing) */}
            <AnimatePresence mode="wait">
              {isPlaying ? (
                <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                  <div className="flex gap-0.5 items-end h-2.5">
                    {[0, 1, 2].map(i => (
                      <motion.div 
                        key={i}
                        animate={{ height: [4, 10, 6, 8, 4] }}
                        transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                        className="w-0.5 bg-neon-green rounded-full"
                      />
                    ))}
                  </div>
                  <Music className="w-3 h-3 text-neon-green opacity-50" />
                </motion.div>
              ) : (
                <motion.div key="idle-r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-4" />
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* --- Home Indicator --- */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-white/20 rounded-full z-[100]" />

        {/* --- Main Content Area --- */}
        <main className="flex-1 flex flex-col p-6 pt-16 overflow-hidden relative z-0 overflow-y-auto hidden-scrollbar pb-32">

          {activeView === 'home' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col w-full">
              {/* Header */}
              <header className="flex justify-between items-center mb-10">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-neon-green rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(57,255,20,0.3)]">
                      <Activity className="w-5 h-5 text-black" />
                  </div>
                  <span className="text-xl font-black font-display tracking-tight">STRIDE</span>
                </div>
                <button 
                  onClick={() => setActiveView('profile')}
                  className="w-10 h-10 rounded-2xl bg-white/5 border border-white/20 p-0.5 overflow-hidden active:scale-90 transition-transform"
                >
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" alt="avatar" className="w-full h-full object-cover" />
                </button>
              </header>

              <div className="flex flex-col items-center">
                <div className="w-full text-left mb-10">
                   <h1 className="text-3xl font-heavy mb-1">Stay active, <span className="text-neon-green">Glazyl</span></h1>
                   <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Next session in 2 hours</p>
                </div>

                {/* Circular Progress Ring - Centered */}
                <div className="relative w-72 h-72 flex-shrink-0 flex items-center justify-center mb-12">
                  <svg className="progress-ring w-full h-full drop-shadow-[0_0_20px_rgba(0,0,0,0.5)]" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" stroke="rgba(255,255,255,0.03)" strokeWidth="3" fill="transparent" />
                    <motion.circle 
                      cx="50" cy="50" r="45" stroke="#39FF14" strokeWidth="4" fill="transparent" strokeDasharray="282.7" 
                      animate={{ strokeDashoffset: dashOffset }}
                      transition={{ type: "spring", stiffness: 30, damping: 15 }}
                      strokeLinecap="round" className="drop-shadow-[0_0_12px_rgba(57,255,20,0.6)]" 
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.25em] font-black">Goal Progress</p>
                    <p className="text-7xl font-black neon-glow font-display leading-none">
                      {Math.max(POINTS_PER_SONG - points, 0).toFixed(0)}<span className="text-xl ml-1 font-medium font-sans">pts</span>
                    </p>
                    <p className="text-[10px] text-neon-green mt-3 font-heavy tracking-widest uppercase">To Unlock Next Song</p>
                  </div>
                </div>

                {/* List Section */}
                <div className="w-full space-y-8 pb-10">
                  {/* Highlight Cards */}
                  <div className="space-y-4">
                    {/* Reward Progress Card */}
                    <div className="bg-[#111111] p-5 rounded-[2rem] border border-white/5 relative overflow-hidden active:scale-[0.98] transition-transform cursor-pointer">
                      <div className="flex items-center space-x-4">
                        <div className="w-20 h-20 bg-white/5 rounded-2xl overflow-hidden shadow-2xl relative flex-shrink-0">
                          <img src={tracks.find(t => t.isLocked)?.cover} alt="" className="w-full h-full object-cover grayscale opacity-30" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Lock className="w-6 h-6 text-white/20" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="px-2 py-0.5 bg-neon-green text-black text-[8px] font-black rounded italic">ACTIVE REWARD</span>
                          </div>
                          <h2 className="text-lg font-black truncate">{tracks.find(t => t.isLocked)?.title || "ALL UNLOCKED"}</h2>
                          <div className="flex items-center gap-2 mt-1">
                             <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <motion.div animate={{ width: `${progressPercent * 100}%` }} className="h-full bg-neon-green shadow-[0_0_10px_#39FF14]" />
                             </div>
                             <span className="text-[9px] font-bold text-white/40">{Math.round(progressPercent * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Ad Boost Card */}
                    <div 
                      onClick={startWatchingAd}
                      className="bg-neon-green/5 p-5 rounded-[2rem] border border-neon-green/10 flex items-center justify-between active:scale-[0.98] transition-transform cursor-pointer"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-neon-green/10 flex items-center justify-center">
                          <Play className="w-5 h-5 text-neon-green" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-tight">Boost Progress</h3>
                          <p className="text-[11px] text-white/40 font-medium tracking-wide">Watch ad for +3 Points</p>
                        </div>
                      </div>
                      <SkipForward className="w-4 h-4 text-neon-green/40" />
                    </div>
                  </div>

                  {/* Ready Mix Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                       <p className="text-[11px] font-black uppercase text-white/30 tracking-[0.2em]">Ready Mix</p>
                       <button onClick={() => setActiveView('library')} className="text-[10px] font-bold text-neon-green/60 uppercase">See All</button>
                    </div>
                    
                    <div className="space-y-3">
                      {tracks.filter(t => !t.isLocked).slice(0, 3).map((track, index) => (
                        <div 
                          key={track.id}
                          onClick={() => setCurrentTrackIndex(tracks.indexOf(track))}
                          className={`bg-white/5 p-4 rounded-3xl flex items-center space-x-4 border border-transparent transition-all active:scale-[0.98] cursor-pointer ${
                            track.id === currentTrack.id ? 'border-neon-green/30 bg-neon-green/5 ml-2' : ''
                          }`}
                        >
                          <div className="w-4 text-[10px] text-white/20 font-black">{index + 1}</div>
                          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-xl flex-shrink-0">
                            <img src={track.cover} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-black truncate ${track.id === currentTrack.id ? 'text-neon-green' : 'text-white'}`}>{track.title}</p>
                            <p className="text-[10px] text-white/40 font-medium truncate italic">{track.artist}</p>
                          </div>
                          <span className="text-[10px] text-white/20 font-mono italic">{track.duration}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeView === 'search' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
               <h2 className="text-3xl font-heavy mb-8">Discover</h2>
               <div className="relative mb-8">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input 
                    type="text" 
                    placeholder="Artists, genres, moods..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm font-medium focus:outline-none focus:border-neon-green/30 transition-all placeholder:text-white/20"
                  />
               </div>
               <div className="flex-1 overflow-y-auto hidden-scrollbar space-y-3 pb-32">
                  <p className="px-2 text-[10px] font-black uppercase text-white/30 tracking-widest mb-4">Top Results</p>
                  {tracks.filter(t => 
                    t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    t.artist.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((track) => (
                    <div 
                      key={track.id}
                      onClick={() => !track.isLocked && setCurrentTrackIndex(tracks.indexOf(track))}
                      className={`bg-white/5 p-4 rounded-3xl flex items-center space-x-4 border border-transparent transition-all active:scale-[0.98] cursor-pointer relative group ${
                        track.id === currentTrack.id ? 'border-neon-green/30 bg-neon-green/5' : ''
                      } ${track.isLocked ? 'opacity-30' : ''}`}
                    >
                      <div className="w-12 h-12 rounded-xl overflow-hidden shadow-xl flex-shrink-0 relative">
                        <img src={track.cover} alt="" className="w-full h-full object-cover" />
                        {track.isLocked && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Lock className="w-4 h-4 text-white/40" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-black truncate ${track.id === currentTrack.id ? 'text-neon-green' : 'text-white'}`}>{track.title}</p>
                        <p className="text-[10px] text-white/40 font-medium truncate">{track.artist}</p>
                      </div>
                      {!track.isLocked && (
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                          <Play className="w-3 h-3 text-white/60 fill-current" />
                        </div>
                      )}
                    </div>
                  ))}
               </div>
            </motion.div>
          )}

          {activeView === 'library' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
               <div className="flex justify-between items-center mb-8">
                  <h2 className="text-3xl font-heavy">Library</h2>
                  <div className="px-3 py-1 bg-neon-green/10 border border-neon-green/20 rounded-lg">
                     <span className="text-[9px] font-black uppercase text-neon-green">{tracks.filter(t => !t.isLocked).length} Unlocked</span>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-4 overflow-y-auto hidden-scrollbar pb-32">
                  {tracks.filter(t => !t.isLocked).map(track => (
                    <motion.div 
                      key={track.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setCurrentTrackIndex(tracks.indexOf(track))}
                      className={`glass p-3 rounded-2xl border border-white/5 cursor-pointer relative overflow-hidden group ${track.id === currentTrack.id ? 'border-neon-green/40 bg-neon-green/5' : ''}`}
                    >
                       <img src={track.cover} className="w-full aspect-square object-cover rounded-xl mb-3 shadow-lg" alt="" />
                       <div>
                          <p className="font-bold text-[13px] truncate leading-tight">{track.title}</p>
                          <p className="text-[10px] text-white/40 italic truncate">{track.artist}</p>
                       </div>
                    </motion.div>
                  ))}
               </div>
            </motion.div>
          )}

          {activeView === 'run' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full items-center">
               <div className="w-full text-left mb-10">
                  <h2 className="text-3xl font-heavy">Current Run</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Session Active • GPS Live</p>
               </div>

               <div className="relative mb-12 flex items-center justify-center">
                  <motion.div 
                    animate={{ scale: isTracking ? [1, 1.02, 1] : 1 }} 
                    transition={{ repeat: Infinity, duration: 3 }}
                    className="w-72 h-72 rounded-full border-4 border-white/5 flex flex-col items-center justify-center relative shadow-[0_0_60px_rgba(0,0,0,0.5)]"
                  >
                     <div className="atmosphere opacity-10" />
                     <p className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-black mb-2">Total Steps</p>
                     <p className="text-7xl font-black neon-glow font-display leading-none">{totalSteps + (points * STEPS_PER_POINT)}</p>
                     <p className="text-sm text-neon-green mt-3 font-heavy tracking-widest uppercase">{points} Points</p>
                     
                     <svg className="absolute inset-0 w-full h-full -rotate-90 scale-[1.02]">
                        <motion.circle 
                          cx="50%" cy="50%" r="48%" 
                          stroke="#39FF14" strokeWidth="4" fill="transparent"
                          strokeDasharray="1413"
                          animate={{ strokeDashoffset: 1413 * (1 - (totalSteps % STEPS_PER_POINT) / STEPS_PER_POINT) }}
                          transition={{ type: "spring", stiffness: 20, damping: 10 }}
                          strokeLinecap="round"
                          className="drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]"
                        />
                     </svg>
                  </motion.div>
               </div>

               <div className="grid grid-cols-2 gap-4 w-full mb-10">
                  <div className="bg-[#111] p-6 rounded-3xl border border-white/5">
                     <p className="text-[9px] text-white/30 font-black uppercase mb-1 tracking-wider">Step Goal</p>
                     <p className="text-xl font-black">{totalSteps % STEPS_PER_POINT}<span className="text-[10px] text-white/20 ml-1">/ {STEPS_PER_POINT}</span></p>
                  </div>
                  <div className="bg-[#111] p-6 rounded-3xl border border-white/5">
                     <p className="text-[9px] text-white/30 font-black uppercase mb-1 tracking-wider">Point Goal</p>
                     <p className="text-xl font-black">{points}<span className="text-[10px] text-white/20 ml-1">/ {POINTS_PER_SONG}</span></p>
                  </div>
               </div>

               <button 
                 onClick={toggleTracking}
                 className={`w-full py-6 rounded-[2rem] text-lg font-black tracking-[0.2em] transition-all uppercase active:scale-95 ${
                   isTracking 
                   ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                   : 'bg-neon-green text-black shadow-[0_0_30px_rgba(57,255,20,0.3)]'
                 }`}
               >
                 {isTracking ? 'STOP RUN' : 'START RUN'}
               </button>

               <div className="mt-8 w-full">
                  <div 
                    onClick={startWatchingAd}
                    className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
                  >
                     <div className="flex items-center gap-3">
                        <Play className="w-4 h-4 text-neon-green" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Watch ad for +3 Points</span>
                     </div>
                     <SkipForward className="w-3 h-3 text-white/20" />
                  </div>
               </div>
            </motion.div>
          )}

          {activeView === 'profile' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full items-center">
               <div className="flex flex-col items-center mb-10 text-center">
                  <div className="w-32 h-32 rounded-[2.5rem] bg-white/5 p-1 border border-white/10 mb-6 group relative">
                    <div className="w-full h-full rounded-[2rem] bg-gradient-to-br from-neon-green/10 to-blue-600/10 flex items-center justify-center overflow-hidden relative shadow-2xl">
                       <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" alt="avatar" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-neon-green rounded-2xl flex items-center justify-center shadow-lg border-4 border-deep-space">
                       <CheckCircle2 className="w-5 h-5 text-black" />
                    </div>
                  </div>
                  <h2 className="text-3xl font-heavy mb-1">Glazyl Alicaway</h2>
                  <p className="text-neon-green font-bold tracking-widest uppercase text-[10px]">A-Tier Runner • Level 14</p>
               </div>

               <div className="grid grid-cols-2 gap-3 w-full mb-10">
                  <div className="bg-[#111] p-5 rounded-2xl border border-white/5 text-center">
                     <p className="text-[9px] text-white/30 uppercase font-black mb-1">Total Steps</p>
                     <p className="text-lg font-black leading-tight">124k</p>
                  </div>
                  <div className="bg-[#111] p-5 rounded-2xl border border-white/5 text-center">
                     <p className="text-[9px] text-white/30 uppercase font-black mb-1">Points</p>
                     <p className="text-lg font-black text-neon-green leading-tight">{points + 42}</p>
                  </div>
                  <div className="bg-[#111] p-5 rounded-2xl border border-white/5 text-center">
                     <p className="text-[9px] text-white/30 uppercase font-black mb-1">Unlocks</p>
                     <p className="text-lg font-black leading-tight">{tracks.filter(t => !t.isLocked).length}</p>
                  </div>
                  <div className="bg-[#111] p-5 rounded-2xl border border-white/5 text-center">
                     <p className="text-[9px] text-white/30 uppercase font-black mb-1">Streak</p>
                     <p className="text-lg font-black leading-tight">4 Days</p>
                  </div>
               </div>

               <div className="w-full space-y-6 pb-20">
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/20 px-2">Account</h3>
                  <div className="bg-[#111] rounded-3xl border border-white/5 divide-y divide-white/5 overflow-hidden">
                     {[
                       { icon: MapPin, label: 'Location Preferences' },
                       { icon: Activity, label: 'Tracking Sensitivity' },
                       { icon: Heart, label: 'Health Integration' },
                       { icon: User, label: 'Personal Details' }
                     ].map((item, i) => (
                        <div key={i} className="p-5 flex items-center justify-between active:bg-white/5 transition-colors cursor-pointer group">
                           <div className="flex items-center gap-4">
                              <item.icon className="w-4 h-4 text-white/40 group-active:text-neon-green" />
                              <span className="text-sm font-bold text-white/80">{item.label}</span>
                           </div>
                           <SkipForward className="w-3 h-3 text-white/10" />
                        </div>
                     ))}
                  </div>
                  
                  <button className="w-full py-5 text-red-500/60 font-black text-xs uppercase tracking-[0.2em] hover:text-red-500 transition-colors">
                     Sign Out
                  </button>
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
        {/* --- Unified Mobile Nav Bar (iOS Style) --- */}
        <nav className="absolute bottom-0 left-0 right-0 h-20 bg-black/40 backdrop-blur-3xl flex items-center justify-around px-6 border-t border-white/5 pb-5 shrink-0 z-[60]">
           <button 
            onClick={() => setActiveView('home')}
            className={`flex flex-col items-center gap-1 transition-all active:scale-90 cursor-pointer ${activeView === 'home' ? 'text-neon-green' : 'text-white/30'}`}
          >
              <HomeIcon className="w-6 h-6" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Home</span>
           </button>
           <button 
            onClick={() => setActiveView('search')}
            className={`flex flex-col items-center gap-1 transition-all active:scale-90 cursor-pointer ${activeView === 'search' ? 'text-neon-green' : 'text-white/30'}`}
          >
              <Search className="w-6 h-6" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Search</span>
           </button>
           <button 
            onClick={() => setActiveView('library')}
            className={`flex flex-col items-center gap-1 transition-all active:scale-90 cursor-pointer ${activeView === 'library' ? 'text-neon-green' : 'text-white/30'}`}
          >
              <Library className="w-6 h-6" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Library</span>
           </button>
           <button 
            onClick={() => setActiveView('run')}
            className={`flex flex-col items-center gap-1 transition-all active:scale-90 cursor-pointer ${activeView === 'run' ? 'text-neon-green' : 'text-white/30'}`}
          >
              <Activity className="w-6 h-6" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Run</span>
           </button>
        </nav>

        {/* --- Floating Mini Player (iOS Style) --- */}
        <AnimatePresence>
          {!isWatchingAd && !showFullPlayer && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="absolute bottom-[90px] left-0 right-0 px-4 z-50 px-3 cursor-pointer"
              onClick={() => setShowFullPlayer(true)}
            >
              <div className="h-16 bg-[#1a1a1a]/80 backdrop-blur-2xl rounded-2xl flex items-center justify-between px-3 border border-white/10 shadow-2xl">
                <div 
                  className="flex items-center space-x-3 w-3/5"
                >
                  <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 shadow-lg">
                    <img src={currentTrack.cover} alt="" className={`w-full h-full object-cover ${isPlaying ? 'scale-110' : 'scale-100'} transition-transform duration-500`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-heavy text-white truncate">{currentTrack.title}</p>
                    <p className="text-[9px] text-neon-green font-bold truncate opacity-80 uppercase tracking-tight">{currentTrack.artist}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => !currentTrack.isLocked && setIsPlaying(!isPlaying)} 
                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center active:scale-90 transition-transform"
                  >
                    {isPlaying && !currentTrack.isLocked ? <Pause className="w-4 h-4 fill-current text-white" /> : <Play className="w-4 h-4 fill-current text-white pl-0.5" />}
                  </button>
                  <button onClick={handleNext} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center active:scale-90 transition-transform">
                    <SkipForward className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Full Screen Player Overlay --- */}
        <AnimatePresence>
          {showFullPlayer && (
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 bg-deep-space z-[80] flex flex-col p-8 pt-16"
            >
              <div className="atmosphere opacity-30 fixed inset-0" />
              
              <header className="flex justify-between items-center mb-10 z-10">
                <button 
                   onClick={() => setShowFullPlayer(false)}
                   className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <SkipBack className="w-5 h-5 rotate-90" />
                </button>
                <div className="text-center px-4 min-w-0 flex-1">
                   <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-0.5">Now Playing</p>
                   <p className="text-sm font-heavy text-white truncate px-2">{currentTrack.title}</p>
                </div>
                <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center active:scale-90 transition-transform">
                   <div className="flex flex-col gap-0.5">
                      <div className="w-4 h-0.5 bg-white rounded-full"></div>
                      <div className="w-4 h-0.5 bg-white rounded-full"></div>
                      <div className="w-2 h-0.5 bg-white rounded-full ml-auto"></div>
                   </div>
                </button>
              </header>

              <div className="flex-1 flex flex-col items-center justify-center z-10 px-2 lg:px-6">
                <motion.div 
                   animate={{ scale: isPlaying ? 1 : 0.9, opacity: isPlaying ? 1 : 0.8 }}
                   className="w-full aspect-square rounded-[2.5rem] overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] relative group border border-white/5"
                >
                   <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                </motion.div>

                <div className="w-full mt-12 text-left">
                  <h2 className="text-3xl font-heavy text-white mb-1">{currentTrack.title}</h2>
                  <p className="text-xl text-neon-green font-bold opacity-80">{currentTrack.artist}</p>
                </div>

                <div className="w-full mt-10 space-y-2">
                   <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(currentTime / songDuration) * 100}%` }}
                        transition={{ type: "spring", stiffness: 50, damping: 20, mass: 0.5 }}
                        className="h-full bg-neon-green shadow-[0_0_15px_#39FF14]"
                      />
                   </div>
                   <div className="flex justify-between text-[10px] font-mono text-white/30">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(songDuration) || currentTrack.duration}</span>
                   </div>
                </div>

                <div className="w-full mt-10 flex items-center justify-between pb-10">
                   <button className="text-white/40 hover:text-white transition-colors"><div className="w-6 h-6 border-2 border-current rounded-lg flex items-center justify-center text-[10px] font-black">HQ</div></button>
                   <div className="flex items-center gap-10">
                      <button onClick={handlePrev} className="text-white active:scale-90 transition-transform"><SkipBack className="w-8 h-8 fill-current" /></button>
                      <button 
                        onClick={() => !currentTrack.isLocked && setIsPlaying(!isPlaying)}
                        className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-black active:scale-90 transition-transform shadow-2xl"
                      >
                         {isPlaying && !currentTrack.isLocked ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current pl-1" />}
                      </button>
                      <button onClick={handleNext} className="text-white active:scale-90 transition-transform"><SkipForward className="w-8 h-8 fill-current" /></button>
                   </div>
                   <button className="text-white/40 hover:text-white transition-colors"><Music className="w-6 h-6" /></button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>



      {/* Ad Overlay Sim (Contained in Frame) */}
      <AnimatePresence>
        {isWatchingAd && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black z-[200] flex flex-col items-center justify-center p-6 text-center"
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

