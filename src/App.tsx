/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
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
  User as UserIcon,
  Camera,
  RefreshCw,
  LogOut,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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
    url: '',
    isLocked: false,
    bpm: 128
  },
  {
    id: '2',
    title: 'Manchild',
    artist: 'Sabrina Carpenter',
    duration: '3:33',
    cover: 'https://images.genius.com/5b099a4fe7bc649900fd54fd4dd747f9.1000x1000x1.png',
    url: '',
    isLocked: true,
    bpm: 140
  },
  {
    id: '3',
    title: 'Stateside + Zara Larsson',
    artist: 'PinkPantheress, Zara Larsson',
    duration: '3:04',
    cover: 'https://images.genius.com/f3eff0988933e71aba2424313b12fe59.1000x1000x1.png',
    url: '',
    isLocked: true,
    bpm: 165
  },
  {
    id: '4',
    title: 'party 4 u',
    artist: 'Charli xcx',
    duration: '4:56',
    cover: 'https://images.genius.com/e618acfa672295153b4a390066c58576.1000x1000x1.png',
    url: '',
    isLocked: true,
    bpm: 155
  },
  {
    id: '5',
    title: 'Womanizer',
    artist: 'Britney Spears',
    duration: '3:44',
    cover: 'https://images.genius.com/e8ef9cf7f7ace6101517128b7eec657b.300x300x1.jpg',
    url: '',
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
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activeView, setActiveView] = useState<'home' | 'search' | 'library' | 'run' | 'profile' | 'welcome'>('welcome');
  const [welcomeAuthMode, setWelcomeAuthMode] = useState<'options' | 'signup' | 'signin'>('options');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [tracks, setTracks] = useState<Track[]>(() => {
    const saved = localStorage.getItem('stride_tracks_v2');
    if (!saved) return SAMPLE_TRACKS;
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
  const [isBuffering, setIsBuffering] = useState(false);

  const [totalSteps, setTotalSteps] = useState(() => {
    return Number(localStorage.getItem('stride_steps') || 523);
  });
  const [hourlySteps, setHourlySteps] = useState<number[]>(() => {
    const saved = localStorage.getItem('stride_hourly_steps');
    return saved ? JSON.parse(saved) : new Array(24).fill(0);
  });
  const [points, setPoints] = useState(() => {
    return Number(localStorage.getItem('stride_points') || 5);
  });
  
  // Profile state
  const [profileName, setProfileName] = useState(() => {
    return localStorage.getItem('stride_profile_name') || 'Glazyl Alicaway';
  });
  const [profileAvatarSeed, setProfileAvatarSeed] = useState(() => {
    return localStorage.getItem('stride_profile_avatar_seed') || 'Glazyl';
  });
  const [profilePhoto, setProfilePhoto] = useState(() => {
    return localStorage.getItem('stride_profile_photo') || null;
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(profileName);
  const [editAvatarSeed, setEditAvatarSeed] = useState(profileAvatarSeed);
  const [editPhoto, setEditPhoto] = useState(profilePhoto);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUnlockedMode, setIsUnlockedMode] = useState(false);
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  
  // Ad state
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [adTimer, setAdTimer] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const watcherRef = useRef<number | null>(null);

  const currentTrack = tracks[currentTrackIndex];

  // Auth observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
      
      if (u) {
        setActiveView(prev => prev === 'welcome' ? 'home' : prev);
      } else {
        // If no user, we stay on welcome (initial state) or if they explicitly sign out
        // We don't force 'welcome' here every time activeView changes anymore
      }
    });

    return () => unsubscribe();
  }, []); // Removed activeView dependency to stop reset loops

  // Firestore Sync
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPoints(data.points || 0);
        setTotalSteps(data.totalSteps || 0);
        setHourlySteps(data.hourlySteps || new Array(24).fill(0));
        setProfileName(data.name || user.displayName || 'Stride Walker');
        setProfileAvatarSeed(data.avatarSeed || user.uid);
        setProfilePhoto(data.photoURL || null);
        
        if (data.unlockedTrackIds) {
          setTracks(prev => prev.map(t => ({
            ...t,
            isLocked: !data.unlockedTrackIds.includes(t.id) && t.id !== '1'
          })));
        }
      } else {
        // Initialize new user
        const initialData = {
          uid: user.uid,
          name: user.displayName || 'New Runner',
          avatarSeed: user.uid,
          photoURL: user.photoURL,
          points: 5,
          totalSteps: 0,
          hourlySteps: new Array(24).fill(0),
          unlockedTrackIds: ['1'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        setDoc(userDocRef, initialData).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user]);

  const syncToFirestore = async (updates: any) => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  // Sync Total Steps and History to Firestore (Debounced)
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      syncToFirestore({ totalSteps, hourlySteps });
      localStorage.setItem('stride_hourly_steps', JSON.stringify(hourlySteps));
    }, 2000); // Sync after 2s of no changes
    return () => clearTimeout(timer);
  }, [totalSteps, hourlySteps, user]);

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Sign in failed", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setActiveView('welcome');
      setWelcomeAuthMode('options');
      setEmail('');
      setPassword('');
      setAuthError(null);
    } catch (error) {
      console.error("Sign out failed", error);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthProcessing(true);
    setAuthError(null);
    try {
      if (welcomeAuthMode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Auth failed", error);
      setAuthError(error.message);
      setIsAuthProcessing(false);
    }
  };

  // Reset progress when track changes
  useEffect(() => {
    setCurrentTime(0);
    setSongDuration(0);
    setIsBuffering(false);
  }, [currentTrackIndex]);

  // Handle music player events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setSongDuration(audio.duration);
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleCanPlay = () => setIsBuffering(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      handleNext();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);

    if (isPlaying && !currentTrack.isLocked) {
      audio.play().catch(e => {
        console.error("Playback failed", e);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isPlaying, currentTrackIndex]);

  // Handle music player seek
  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleTracking = () => {
    if (isTracking) {
      if (watcherRef.current !== null) {
        navigator.geolocation.clearWatch(watcherRef.current);
        watcherRef.current = null;
      }
      setIsTracking(false);
    } else {
      if (!navigator.geolocation) {
        alert("Geolocation not supported");
        return;
      }
      setIsTracking(true);
      setGpsError(null);
      watcherRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setLastCoords(prev => {
            if (prev) {
              const dist = calculateDistance(prev.lat, prev.lng, latitude, longitude);
              if (dist > 0.5) { 
                const newSteps = Math.max(1, Math.round(dist * 1.3));
                setTotalSteps(s => s + newSteps);
                
                // Track hourly history
                const currentHour = new Date().getHours();
                setHourlySteps(prevHistory => {
                  const newHistory = [...prevHistory];
                  newHistory[currentHour] = (newHistory[currentHour] || 0) + newSteps;
                  return newHistory;
                });
              }
            }
            return { lat: latitude, lng: longitude };
          });
        },
        (err) => {
          console.error("GPS Error:", err);
          setGpsError(err.message === "User denied Geolocation" ? "Location permission denied. Please enable GPS." : err.message);
          setIsTracking(false);
          watcherRef.current = null;
        },
        { 
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );

      // Also auto-play if music is paused
      if (!isPlaying && !tracks[currentTrackIndex].isLocked) {
        setIsPlaying(true);
      }
    }
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
      if (user) {
        syncToFirestore({ points: points + AD_REWARD_POINTS });
      } else {
        setPoints(prev => prev + AD_REWARD_POINTS);
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isWatchingAd, adTimer]);

  // Convert Steps to Points
  useEffect(() => {
    if (totalSteps >= STEPS_PER_POINT) {
      const newPoints = Math.floor(totalSteps / STEPS_PER_POINT);
      const remainingSteps = totalSteps % STEPS_PER_POINT;
      
      if (user) {
        syncToFirestore({
          points: points + newPoints,
          totalSteps: remainingSteps
        });
      } else {
        setPoints(prev => prev + newPoints);
        setTotalSteps(remainingSteps);
      }
    }
  }, [totalSteps, user]);

  // Check for unlocks using points
  useEffect(() => {
    const nextLocked = tracks.find(t => t.isLocked);
    if (nextLocked && points >= POINTS_PER_SONG) {
      const unlockedIds = tracks.filter(t => !t.isLocked).map(t => t.id);
      unlockedIds.push(nextLocked.id);

      if (user) {
        syncToFirestore({
          points: points - POINTS_PER_SONG,
          unlockedTrackIds: unlockedIds
        });
      } else {
        setTracks(prev => {
          const next = [...prev];
          const index = next.findIndex(t => t.id === nextLocked.id);
          if (index !== -1) {
            next[index] = { ...next[index], isLocked: false };
          }
          return next;
        });
        setPoints(prev => prev - POINTS_PER_SONG);
      }
      setIsUnlockedMode(true);
      setTimeout(() => setIsUnlockedMode(false), 3000);
    }
  }, [points, tracks, user]);

  const handleNext = () => {
    setCurrentTrackIndex(prev => (prev + 1) % tracks.length);
  };

  const handlePrev = () => {
    setCurrentTrackIndex(prev => (prev - 1 + tracks.length) % tracks.length);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const randomizeSeed = () => {
    const randomSeed = Math.random().toString(36).substring(7);
    setEditAvatarSeed(randomSeed);
    setEditPhoto(null); // Clear custom photo if user chooses to randomize
  };

  const progressPercent = Math.min(points / POINTS_PER_SONG, 1);
  const dashOffset = 282.7 * (1 - progressPercent);

  const stepProgressPercent = Math.min(totalSteps / STEPS_PER_POINT, 1);
  const stepDashOffset = 282.7 * (1 - stepProgressPercent);

  const totalStepsOverall = totalSteps + (points * STEPS_PER_POINT);
  const calories = totalStepsOverall * 0.04;
  const calGoal = 500;
  const calProgressPercent = Math.min(calories / calGoal, 1);
  const calDashOffset = 219.9 * (1 - calProgressPercent);

  const parseDurationToSeconds = (durationStr: string) => {
    const parts = durationStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return 0;
  };

  const displayDuration = songDuration > 0 ? songDuration : parseDurationToSeconds(currentTrack.duration);

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
        <main className={`flex-1 flex flex-col p-6 pt-16 relative z-0 overflow-y-auto hidden-scrollbar ${activeView === 'welcome' ? 'pb-10' : 'pb-56'}`}>
          
          {isAuthLoading && activeView !== 'welcome' && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
              <RefreshCw className="w-8 h-8 text-neon-green animate-spin" />
            </div>
          )}

          {activeView === 'welcome' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="flex flex-col min-h-full items-center justify-center text-center relative z-10"
            >
              <div className="w-20 h-20 bg-neon-green rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(57,255,20,0.4)] mb-10">
                <Activity className="w-12 h-12 text-black" />
              </div>
              <h1 className="text-4xl font-heavy mb-4 tracking-tighter">Welcome to <span className="text-neon-green">STRIDE</span></h1>
              <p className="text-white/40 text-sm max-w-[240px] mb-12 font-medium leading-relaxed">
                Connect your account to sync your progress, unlocks, and profile across all devices.
              </p>
              
              <AnimatePresence mode="wait">
                {welcomeAuthMode === 'options' ? (
                  <motion.div 
                    key="options"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="w-full flex flex-col gap-4"
                  >
                    <button 
                      onClick={handleSignIn}
                      className="w-full flex items-center justify-center gap-4 bg-white text-black py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] active:scale-[0.98] transition-transform shadow-xl"
                    >
                      <div className="w-5 h-5 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-full h-full">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18c-.77 1.56-1.21 3.31-1.21 5.14 0 1.83.44 3.58 1.21 5.14l3.66-2.84z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                        </svg>
                      </div>
                      Continue with Google
                    </button>

                    <button 
                      onClick={() => setWelcomeAuthMode('signup')}
                      className="w-full flex items-center justify-center gap-4 bg-white/5 border border-white/10 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] active:scale-[0.98] transition-transform"
                    >
                      Create Account
                    </button>

                    <button 
                      onClick={() => setWelcomeAuthMode('signin')}
                      className="text-[10px] font-black uppercase text-neon-green/60 tracking-[0.2em] py-2"
                    >
                      Already have an account? Sign In
                    </button>
                  </motion.div>
                ) : (
                  <motion.form 
                    key="form"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    onSubmit={handleEmailAuth}
                    className="w-full flex flex-col gap-4"
                  >
                    <div className="flex flex-col gap-2">
                       <input 
                         type="email" 
                         placeholder="Email Address"
                         required
                         value={email}
                         onChange={(e) => setEmail(e.target.value)}
                         className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-sm focus:border-neon-green/50 outline-none transition-colors"
                       />
                       <input 
                         type="password" 
                         placeholder="Password"
                         required
                         value={password}
                         onChange={(e) => setPassword(e.target.value)}
                         className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-sm focus:border-neon-green/50 outline-none transition-colors"
                       />
                    </div>

                    {authError && (
                      <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider">{authError}</p>
                    )}

                    <button 
                      disabled={isAuthProcessing}
                      type="submit"
                      className="w-full bg-neon-green text-black py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(57,255,20,0.2)] disabled:opacity-50"
                    >
                      {isAuthProcessing ? (
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto" />
                      ) : (
                        welcomeAuthMode === 'signup' ? 'Sign Up' : 'Sign In'
                      )}
                    </button>

                    <button 
                      type="button"
                      onClick={() => {
                        setWelcomeAuthMode('options');
                        setAuthError(null);
                      }}
                      className="text-[10px] font-black uppercase text-white/30 tracking-[0.2em] py-2"
                    >
                      Back to Options
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>

              <button 
                onClick={() => setActiveView('home')}
                className="text-xs font-black uppercase text-white/20 tracking-widest py-4 mt-4"
              >
                Continue as Guest
              </button>
            </motion.div>
          )}
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
                  <img 
                    src={profilePhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileAvatarSeed}`} 
                    alt="avatar" 
                    className="w-full h-full object-cover" 
                  />
                </button>
              </header>

              <div className="flex flex-col items-center">
                <div className="w-full text-left mb-10">
                   <h1 className="text-3xl font-heavy mb-1">Stay active, <span className="text-neon-green">{profileName.split(' ')[0]}</span></h1>
                   <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isTracking ? 'bg-neon-green animate-pulse' : 'bg-white/20'}`} />
                      <p className="text-white/40 text-xs font-bold uppercase tracking-wider">
                        {isTracking ? 'Session Active • GPS Live' : 'Ready to Run • Press Start'}
                      </p>
                   </div>
                </div>

                {/* Circular Activity Ring - Centered */}
                <div className="relative w-85 h-85 flex-shrink-0 flex items-center justify-center mb-10">
                  <svg className="progress-ring w-full h-full drop-shadow-[0_0_25px_rgba(0,0,0,0.6)]" viewBox="0 0 100 100">
                    {/* Background Tracks */}
                    <circle cx="50" cy="50" r="45" stroke="rgba(57,255,20,0.05)" strokeWidth="8" fill="transparent" />
                    <circle cx="50" cy="50" r="36" stroke="rgba(255,77,77,0.05)" strokeWidth="8" fill="transparent" />
                    
                    {/* Ring 1: Steps (Neon Green) */}
                    <motion.circle 
                      cx="50" cy="50" r="45" stroke="#39FF14" strokeWidth="8" fill="transparent" 
                      strokeDasharray="282.7" 
                      animate={{ strokeDashoffset: 282.7 * (1 - stepProgressPercent) }}
                      transition={{ type: "spring", stiffness: 40, damping: 20 }}
                      strokeLinecap="round" className="drop-shadow-[0_0_12px_rgba(57,255,20,0.5)]" 
                    />

                    {/* Ring 2: Calories (Vibrant Red) */}
                    <motion.circle 
                      cx="50" cy="50" r="36" stroke="#FF4D4D" strokeWidth="8" fill="transparent" 
                      strokeDasharray="226.2" 
                      animate={{ strokeDashoffset: 226.2 * (1 - calProgressPercent) }}
                      transition={{ type: "spring", stiffness: 40, damping: 20, delay: 0.1 }}
                      strokeLinecap="round" className="drop-shadow-[0_0_10px_rgba(255,77,77,0.4)]" 
                    />
                  </svg>
                  
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <div className="flex flex-col items-center mb-1">
                      <p className="text-[11px] text-white/30 uppercase tracking-[0.4em] font-black">Steps</p>
                      <p className="text-6xl font-black neon-glow font-display leading-[0.8] mt-2 mb-1">{totalStepsOverall}</p>
                    </div>
                    
                    <div className="h-[2px] w-8 bg-white/10 my-3 rounded-full" />

                    <div className="flex flex-col items-center">
                      <p className="text-[10px] text-[#FF4D4D]/60 uppercase tracking-[0.4em] font-black">kcal</p>
                      <p className="text-3xl font-black text-[#FF4D4D] font-display mt-1">{calories.toFixed(0)}</p>
                    </div>

                    <div className="absolute -bottom-8 flex items-center gap-2">
                       <span className="px-3 py-1 bg-neon-green/10 rounded-full text-[10px] text-neon-green font-black uppercase tracking-wider border border-neon-green/20">
                         {points} PTS EARNED
                       </span>
                    </div>
                  </div>
                </div>

                {/* Main Action Button */}
                <div className="w-full mb-12 space-y-4">
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

                  <AnimatePresence>
                    {gpsError && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl w-full"
                      >
                        <p className="text-red-500 text-[10px] font-black uppercase tracking-tighter text-center">
                          GPS Error: {gpsError}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Health Stat Cards */}
                <div className="grid grid-cols-2 gap-4 w-full mb-12">
                  {/* Step Count Card */}
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-[#1C1C1E] rounded-2xl p-4 shadow-2xl border border-white/5 flex flex-col h-48 relative overflow-hidden"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-[#FF453A]" />
                      <span className="text-[#FF453A] text-[10px] font-bold uppercase tracking-wider">Step Count</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-white/40 text-[10px] font-medium">Today</span>
                      <span className="text-3xl font-semibold text-[#FF453A] tracking-tight">{totalStepsOverall.toLocaleString()}</span>
                    </div>
                    
                    {/* Mini Bar Graph */}
                    <div className="mt-auto flex items-end justify-between gap-1 h-12 relative">
                      <div className="absolute inset-0 border-b border-white/5 flex flex-col justify-between py-1">
                        <div className="w-full h-[0.5px] bg-white/5" />
                        <div className="w-full h-[0.5px] bg-white/5" />
                      </div>
                      {(() => {
                        const aggregated = [];
                        for (let i = 0; i < 24; i += 2) {
                          aggregated.push(hourlySteps[i] + (hourlySteps[i+1] || 0));
                        }
                        const max = Math.max(...aggregated, 1);
                        return aggregated.map((val, i) => (
                          <div 
                            key={i} 
                            className={`w-full rounded-t-sm transition-all duration-500 ${val > 0 ? 'bg-[#FF453A]/40' : 'bg-white/5'}`}
                            style={{ height: `${val > 0 ? (val / max) * 100 : 5}%` }} 
                          />
                        ));
                      })()}
                    </div>
                    <div className="flex justify-between mt-1 px-0.5">
                      <span className="text-[7px] text-white/20 font-black">6AM</span>
                      <span className="text-[7px] text-white/20 font-black">12PM</span>
                      <span className="text-[7px] text-white/20 font-black">6PM</span>
                    </div>
                  </motion.div>

                  {/* Step Distance Card */}
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-[#1C1C1E] rounded-2xl p-4 shadow-2xl border border-white/5 flex flex-col h-48 relative overflow-hidden"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-[#64D2FF]" />
                      <span className="text-[#64D2FF] text-[10px] font-bold uppercase tracking-wider">Distance</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-white/40 text-[10px] font-medium">Today</span>
                      <span className="text-3xl font-semibold text-[#64D2FF] tracking-tight">{(totalStepsOverall * 0.00076).toFixed(2)}<span className="text-sm ml-0.5 font-medium">km</span></span>
                    </div>
                    
                    {/* Mini Bar Graph */}
                    <div className="mt-auto flex items-end justify-between gap-1 h-12 relative">
                      <div className="absolute inset-0 border-b border-white/5 flex flex-col justify-between py-1">
                        <div className="w-full h-[0.5px] bg-white/5" />
                        <div className="w-full h-[0.5px] bg-white/5" />
                      </div>
                      {(() => {
                        const aggregated = [];
                        for (let i = 0; i < 24; i += 2) {
                          aggregated.push(hourlySteps[i] + (hourlySteps[i+1] || 0));
                        }
                        const max = Math.max(...aggregated, 1);
                        return aggregated.map((val, i) => (
                          <div 
                            key={i} 
                            className={`w-full rounded-t-sm transition-all duration-500 ${val > 0 ? 'bg-[#64D2FF]/40' : 'bg-white/5'}`}
                            style={{ height: `${val > 0 ? (val / max) * 100 : 5}%` }} 
                          />
                        ));
                      })()}
                    </div>
                    <div className="flex justify-between mt-1 px-0.5">
                      <span className="text-[7px] text-white/20 font-black">6AM</span>
                      <span className="text-[7px] text-white/20 font-black">12PM</span>
                      <span className="text-[7px] text-white/20 font-black">6PM</span>
                    </div>
                  </motion.div>
                </div>

                {/* List Section */}
                <div className="w-full space-y-8 pb-10">
                  {/* Highlight Cards */}
                  <div className="space-y-4">
                    {/* Reward Progress Card */}
                    <div className="bg-[#111111] p-5 rounded-[2rem] border border-white/5 relative overflow-hidden active:scale-[0.98] transition-transform cursor-pointer">
                      <div className="flex items-center space-x-4">
                        <div className="w-20 h-20 bg-white/5 rounded-2xl overflow-hidden shadow-2xl relative flex-shrink-0">
                          <img src={tracks.find(t => t.isLocked)?.cover} alt="" className="w-full h-full object-cover grayscale opacity-[0.25]" />
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                            <Lock className="w-6 h-6 text-white/20" />
                            <p className="text-[7px] font-black uppercase text-white/40 tracking-widest">Run to unlock</p>
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
                      } ${track.isLocked ? 'opacity-50' : ''}`}
                    >
                      <div className="w-12 h-12 rounded-xl overflow-hidden shadow-xl flex-shrink-0 relative">
                        <img src={track.cover} alt="" className={`w-full h-full object-cover ${track.isLocked ? 'grayscale opacity-[0.25]' : ''}`} />
                        {track.isLocked && (
                          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center">
                            <Lock className="w-3 h-3 text-white/50" />
                            <p className="text-[5px] font-black uppercase text-neon-green/80 tracking-tighter mt-0.5">Run to unlock</p>
                          </div>
                        )}
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

          {activeView === 'profile' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full items-center">
               <AnimatePresence mode="wait">
                 {isEditingProfile ? (
                   <motion.div 
                    key="edit-profile"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full space-y-8 py-4"
                   >
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-heavy">Edit Profile</h2>
                        <button 
                          onClick={() => {
                            setIsEditingProfile(false);
                            setEditName(profileName);
                            setEditAvatarSeed(profileAvatarSeed);
                          }}
                          className="text-xs font-black uppercase text-white/40 tracking-widest"
                        >
                          Cancel
                        </button>
                     </div>

                     <div className="flex flex-col items-center space-y-6">
                        <div className="relative group">
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            className="hidden" 
                            accept="image/*"
                          />
                          <div className="w-28 h-28 rounded-[2.2rem] bg-white/5 p-1 border border-white/10 overflow-hidden relative">
                             <img 
                               src={editPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${editAvatarSeed}`} 
                               alt="Preview" 
                               className="w-full h-full object-cover" 
                             />
                             <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm"
                             >
                                <Camera className="w-6 h-6 text-white" />
                             </button>
                          </div>
                          <div className="absolute -bottom-2 -right-2 flex gap-1">
                             <button 
                                onClick={randomizeSeed}
                                className="w-8 h-8 bg-white/10 border border-white/10 rounded-xl flex items-center justify-center backdrop-blur-md active:scale-90 transition-transform shadow-lg"
                                title="Randomize Avatar"
                             >
                                <RefreshCw className="w-4 h-4 text-white/60" />
                             </button>
                             {editPhoto && (
                                <button 
                                  onClick={() => setEditPhoto(null)}
                                  className="w-8 h-8 bg-red-500/20 border border-red-500/20 rounded-xl flex items-center justify-center backdrop-blur-md active:scale-90 transition-transform shadow-lg"
                                  title="Remove Photo"
                                >
                                  <UserIcon className="w-4 h-4 text-red-500" />
                                </button>
                             )}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-col items-center w-full">
                           <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-2">Avatar Seed (Optional)</p>
                           <div className="flex w-full gap-2">
                              <input 
                                  type="text"
                                  value={editAvatarSeed}
                                  onChange={(e) => {
                                    setEditAvatarSeed(e.target.value);
                                    setEditPhoto(null);
                                  }}
                                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-neon-green/30"
                                  placeholder="Change seed..."
                              />
                           </div>
                           <p className="text-[9px] text-white/20 mt-2 italic">Uploading a photo overrides the avatar illustration</p>
                        </div>

                        <div className="w-full space-y-2">
                           <p className="text-[10px] font-black uppercase text-white/30 tracking-widest ml-2">Display Name</p>
                           <input 
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm font-bold focus:outline-none focus:border-neon-green/30 transition-all"
                              placeholder="Enter your name..."
                           />
                        </div>

                        <button 
                          onClick={() => {
                            if (user) {
                              syncToFirestore({
                                name: editName,
                                avatarSeed: editAvatarSeed,
                                photoURL: editPhoto
                              });
                            } else {
                              setProfileName(editName);
                              setProfileAvatarSeed(editAvatarSeed);
                              setProfilePhoto(editPhoto);
                            }
                            setIsEditingProfile(false);
                          }}
                          className="w-full py-5 bg-neon-green text-black rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(57,255,20,0.2)] active:scale-[0.98] transition-transform"
                        >
                          Save Changes
                        </button>
                     </div>
                   </motion.div>
                 ) : (
                   <motion.div 
                    key="view-profile"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center w-full"
                   >
                      <div className="flex flex-col items-center mb-10 text-center">
                          <div className="w-32 h-32 rounded-[2.5rem] bg-white/5 p-1 border border-white/10 mb-6 group relative">
                            <div className="w-full h-full rounded-[2rem] bg-gradient-to-br from-neon-green/10 to-blue-600/10 flex items-center justify-center overflow-hidden relative shadow-2xl">
                              <img 
                                src={profilePhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileAvatarSeed}`} 
                                alt="avatar" 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                              />
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-neon-green rounded-2xl flex items-center justify-center shadow-lg border-4 border-deep-space">
                              <CheckCircle2 className="w-5 h-5 text-black" />
                            </div>
                          </div>
                          <h2 className="text-3xl font-heavy mb-1">{profileName}</h2>
                          <p className="text-neon-green font-bold tracking-widest uppercase text-[10px]">Beginner Runner • Level 1</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 w-full mb-10">
                          <div className="bg-[#111] p-5 rounded-2xl border border-white/5 text-center">
                            <p className="text-[9px] text-white/30 uppercase font-black mb-1">Total Steps</p>
                            <p className="text-lg font-black leading-tight">{totalSteps.toLocaleString()}</p>
                          </div>
                          <div className="bg-[#111] p-5 rounded-2xl border border-white/5 text-center">
                            <p className="text-[9px] text-white/30 uppercase font-black mb-1">Points</p>
                            <p className="text-lg font-black text-neon-green leading-tight">{points}</p>
                          </div>
                          <div className="bg-[#111] p-5 rounded-2xl border border-white/5 text-center">
                            <p className="text-[9px] text-white/30 uppercase font-black mb-1">Unlocks</p>
                            <p className="text-lg font-black leading-tight">{tracks.filter(t => !t.isLocked).length}</p>
                          </div>
                          <div className="bg-[#111] p-5 rounded-2xl border border-white/5 text-center">
                            <p className="text-[9px] text-white/30 uppercase font-black mb-1">Streak</p>
                            <p className="text-lg font-black leading-tight">0 Days</p>
                          </div>
                      </div>

                      <div className="w-full space-y-6 pb-20">
                          <div className="flex justify-between items-center px-2">
                             <h3 className="text-xs font-black uppercase tracking-widest text-white/20">Account</h3>
                             <button 
                               onClick={() => {
                                 setEditName(profileName);
                                 setEditAvatarSeed(profileAvatarSeed);
                                 setIsEditingProfile(true);
                               }}
                               className="text-[10px] font-black uppercase text-neon-green/60"
                             >
                               Edit
                             </button>
                          </div>

                          
                          <button 
                            onClick={handleSignOut}
                            className="w-full py-5 text-red-500/60 font-black text-xs uppercase tracking-[0.2em] hover:text-red-500 transition-colors flex items-center justify-center gap-2"
                          >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                          </button>
                      </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </motion.div>
          )}

          {/* Dev Utils for Testing (Hidden deep) */}
          <div className="mt-auto pt-20">
          </div>
        </main>
        {/* --- Unified Mobile Nav Bar (iOS Style) --- */}
        {activeView !== 'welcome' && (
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
          </nav>
        )}

        {/* --- Floating Mini Player (iOS Style) --- */}
        <AnimatePresence>
          {activeView !== 'welcome' && !isWatchingAd && !showFullPlayer && (
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
                  <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 shadow-lg relative">
                    <img src={currentTrack.cover} alt="" className={`w-full h-full object-cover ${isPlaying ? 'scale-110' : 'scale-100'} transition-transform duration-500 ${currentTrack.isLocked ? 'grayscale opacity-[0.25]' : ''}`} />
                    {currentTrack.isLocked && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Lock className="w-3 h-3 text-white/50" />
                      </div>
                    )}
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
                   <img src={currentTrack.cover} alt="" className={`w-full h-full object-cover ${currentTrack.isLocked ? 'grayscale opacity-[0.25]' : ''}`} />
                   {currentTrack.isLocked && (
                     <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
                       <Lock className="w-10 h-10 text-white/40" />
                       <p className="text-xs font-black uppercase text-neon-green tracking-[0.2em] shadow-sm">Run to unlock</p>
                     </div>
                   )}
                </motion.div>

                <div className="w-full mt-12 text-left">
                  <h2 className="text-3xl font-heavy text-white mb-1">{currentTrack.title}</h2>
                  <p className="text-xl text-neon-green font-bold opacity-80">{currentTrack.artist}</p>
                </div>

                <div className="w-full mt-10 space-y-2">
                   <div 
                     className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden relative cursor-pointer"
                     onClick={(e) => {
                       const rect = e.currentTarget.getBoundingClientRect();
                       const x = e.clientX - rect.left;
                       const percent = x / rect.width;
                       if (songDuration > 0) handleSeek(percent * songDuration);
                     }}
                   >
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0}%` }}
                        transition={{ type: "spring", stiffness: 50, damping: 20, mass: 0.5 }}
                        className="h-full bg-neon-green shadow-[0_0_15px_#39FF14]"
                      />
                   </div>
                   <div className="flex justify-between text-[10px] font-mono text-white/30">
                      <span>{formatTime(currentTime)}</span>
                      <span>{displayDuration > 0 ? formatTime(displayDuration) : currentTrack.duration}</span>
                   </div>
                </div>

                <div className="w-full mt-10 flex items-center justify-between pb-10">
                   <button className="text-white/40 hover:text-white transition-colors"><div className="w-6 h-6 border-2 border-current rounded-lg flex items-center justify-center text-[10px] font-black">HQ</div></button>
                   <div className="flex items-center gap-10 relative">
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
      />
    </div>
  );
}

