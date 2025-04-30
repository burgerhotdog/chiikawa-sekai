import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Box, Typography, CircularProgress, CssBaseline } from '@mui/material';
import { Home, Refresh } from "@mui/icons-material";
import CHIIKAWA_SPRITE from "./assets/chiikawa.webp";
import HACHIWARE_SPRITE from "./assets/hachiware.webp";
import USAGI_SPRITE from "./assets/usagi.webp";
import MOMONGA_SPRITE from "./assets/momonga.webp";
import audioFile from './audio.mp3';

const LANE_KEYS = ['d', 'f', 'j', 'k'];
const LANE_WIDTH = 100;
const GAME_HEIGHT = 600;
const SPRITE_SIZE = 100;
const NOTE_SPEED = 500; // px per beat
const BPM = 134;
const OFFSET = -0.2; // Initial offset in seconds
const beatsToSeconds = (beats) => (beats * 60) / BPM;
const NOTE_DATA = [
  [0, 2],
  [0.5, 2],
  [1, 2],
  [2, 1],
  [2.5, 1],
  [3, 1],
  [3.5, 1],
  [4, 1],
  [5, 1],
  [5.5, 1],
  [6, 1],
  [6.5, 1],
  [7, 1],
  [8, 2],
  [8.5, 2],
  [9, 2],
  [10, 1],
  [10.5, 1],
  [11, 1],
  [11.5, 1],
  [12, 1],
  [13, 1],
  [13.5, 1],
  [14, 1],
  [14.5, 1],
  [15, 1],
  [16, 2],
  [16.5, 2],
  [17, 2],
  [18, 1],
  [18.5, 1],
  [19, 1],
  [19.5, 1],
  [20, 1],
  [21, 1],
  [21.5, 1],
  [22, 1],
  [22.5, 1],
  [23, 1],
];

const App = () => {
  const [gameState, setGameState] = useState('menu');
  const [isLoading, setIsLoading] = useState(true);
  const [isFlying, setIsFlying] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [hitNotes, setHitNotes] = useState(0);
  const [missedNotes, setMissedNotes] = useState(0);
  const [highScore, setHighScore] = useState(() =>
    parseInt(localStorage.getItem('highScore') || '0')
  );
  const [notes, setNotes] = useState([]);
  const [pressedKeys, setPressedKeys] = useState(new Set());
  const [hitNoteAnimations, setHitNoteAnimations] = useState({});
  
  // Audio refs
  const audioContextRef = useRef(null);
  const audioBufferRef = useRef(null);
  const audioSourceRef = useRef(null);
  const startTimeRef = useRef(0);
  const animationFrameRef = useRef();

  // Track pressed keys for each note
  const noteHitStatusRef = useRef({});
  
  // Randomize lanes for each playthrough
  const [laneAssignments, setLaneAssignments] = useState(() =>
    NOTE_DATA.map(([_, count]) => {
      const lanes = Array(4).fill(false);
      for (let i = 0; i < count; i++) {
        let randomIndex;
        do {
          randomIndex = Math.floor(Math.random() * 4);
        } while (lanes[randomIndex]);
        lanes[randomIndex] = true;
      }
      return lanes;
    })
  );

  // Initialize Web Audio API on component mount
  useEffect(() => {
    // Create audio context
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContextRef.current = new AudioContext();
    
    // Fetch and decode audio file
    fetch(audioFile)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => audioContextRef.current.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        audioBufferRef.current = audioBuffer;
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Error loading audio:', error);
        setIsLoading(false);
      });
      
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const playAudio = useCallback((delaySeconds = 0) => {
    if (!audioContextRef.current || !audioBufferRef.current) return;
    
    // Stop any currently playing audio
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
    }
    
    // Create new audio source
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    
    // Add gain node to control volume
    const gainNode = audioContextRef.current.createGain();
    gainNode.gain.value = 0.2; // Set volume to 20%
    
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    // Schedule audio playback
    const startTime = audioContextRef.current.currentTime + delaySeconds;
    source.start(startTime);
    audioSourceRef.current = source;
    
    return startTime;
  }, []);

  const startGame = useCallback(() => {
    setGameState('playing');
    setScore(0);
    setCombo(0);
    setHitNotes(0);
    setMissedNotes(0);
    setNotes([]);
    
    // Clear note hit status tracking
    noteHitStatusRef.current = {};
    
    // Reset timing references
    startTimeRef.current = 0;
    
    // Randomize lane assignments
    setLaneAssignments(NOTE_DATA.map(([_, count]) => {
      const lanes = Array(4).fill(false);
      for (let i = 0; i < count; i++) {
        let randomIndex;
        do {
          randomIndex = Math.floor(Math.random() * 4);
        } while (lanes[randomIndex]);
        lanes[randomIndex] = true;
      }
      return lanes;
    }));

    // If audio context is suspended (due to autoplay policy), resume it
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    // Add a 4-beat count-in before starting the music
    const countInBeats = 4;
    const countInSeconds = beatsToSeconds(countInBeats);
    
    // Play audio with delay
    const audioStartTime = playAudio(countInSeconds);
    
    // Save the game start time reference
    startTimeRef.current = audioStartTime - OFFSET; // Adjust by offset
    
    const updateNotes = () => {
      const currentAudioTime = audioContextRef.current.currentTime;
      
      // Generate notes based on current time
      const activeNotes = NOTE_DATA
        .map(([beat, count], index) => ({
          id: index,
          time: beatsToSeconds(beat) + startTimeRef.current,
          count,
          lanes: laneAssignments[index],
          // Count how many lanes this note uses
          totalLanes: laneAssignments[index].filter(Boolean).length
        }));

      setNotes(activeNotes);

      // Check if game is finished
      const lastNoteTime = beatsToSeconds(NOTE_DATA[NOTE_DATA.length - 1][0]) + startTimeRef.current;
      if (currentAudioTime > lastNoteTime + 1) {
        if (audioSourceRef.current) {
          audioSourceRef.current.stop();
        }
        setGameState('results');
        const newHighScore = score > highScore ? score : highScore;
        setHighScore(newHighScore);
        localStorage.setItem('highScore', newHighScore.toString());
        return;
      }

      animationFrameRef.current = requestAnimationFrame(updateNotes);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateNotes);
  }, [highScore, laneAssignments, playAudio, score]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (gameState !== 'playing') return;
      const keyIndex = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (keyIndex === -1) return;

      // Add key to pressed keys
      setPressedKeys(prev => new Set([...prev, e.key.toLowerCase()]));

      const currentTime = audioContextRef.current.currentTime;
      
      // Find notes within hit window
      const activeNotes = notes.filter(note => {
        const noteTime = note.time;
        const timeDiff = Math.abs(currentTime - noteTime);
        
        // Allow timing window of 150ms before and after the perfect hit time
        return timeDiff < 0.15;
      });

      // If no notes are in the hit window, count it as a miss
      if (activeNotes.length === 0) {
        setMissedNotes(prev => prev + 1);
        setCombo(0);
        return;
      }

      // Process each potential note
      activeNotes.forEach(note => {
        // Skip if this lane isn't active for this note
        if (!note.lanes[keyIndex]) return;
        
        // Initialize hit status tracking for this note if needed
        if (!noteHitStatusRef.current[note.id]) {
          noteHitStatusRef.current[note.id] = {
            hitLanes: Array(4).fill(false),
            processed: false,
            timeDiff: Math.abs(currentTime - note.time)
          };
        }
        
        // Mark this lane as hit
        noteHitStatusRef.current[note.id].hitLanes[keyIndex] = true;
        
        // Check if all required lanes have been hit
        const status = noteHitStatusRef.current[note.id];
        const allLanesHit = note.lanes.every((lane, idx) => 
          !lane || status.hitLanes[idx]
        );
        
        // Only process the note once all required lanes have been hit
        if (allLanesHit && !status.processed) {
          status.processed = true;
          
          // Calculate note position at hit time
          const noteTimeRemaining = note.time - currentTime;
          const noteY = (GAME_HEIGHT - 35) - noteTimeRemaining * NOTE_SPEED;
          
          // Add hit animation state with note position
          setHitNoteAnimations(prev => ({
            ...prev,
            [note.id]: {
              startTime: currentTime,
              lanes: note.lanes,
              hitY: noteY
            }
          }));
          
          // Calculate score based on timing accuracy
          const timeDiff = status.timeDiff;
          let hitQuality = 1.0;
          
          // Adjust score multiplier based on timing accuracy
          if (timeDiff < 0.05) {
            hitQuality = 1.0; // Perfect
          } else if (timeDiff < 0.1) {
            hitQuality = 0.8; // Good
          } else {
            hitQuality = 0.5; // OK
          }
          
          const basePoints = 100 * note.totalLanes; // Base points per note is 100 * number of lanes
          const multiplier = combo + 1;
          
          setScore(prev => prev + Math.round(basePoints * multiplier * hitQuality));
          setCombo(prev => prev + note.totalLanes); // Add number of lanes to combo
          setHitNotes(prev => prev + 1);
          
          // Remove the note from display after animation
          setTimeout(() => {
            setNotes(prev => prev.filter(n => n.id !== note.id));
            setHitNoteAnimations(prev => {
              const newState = { ...prev };
              delete newState[note.id];
              return newState;
            });
          }, 600);
        }
      });
    };

    const handleKeyRelease = (e) => {
      const key = e.key.toLowerCase();
      if (LANE_KEYS.includes(key)) {
        setPressedKeys(prev => {
          const newSet = new Set(prev);
          newSet.delete(key);
          return newSet;
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('keyup', handleKeyRelease);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('keyup', handleKeyRelease);
    };
  }, [gameState, notes, combo]);

  // Check for missed notes
  useEffect(() => {
    if (gameState !== 'playing') return;
    
    const checkMissedNotes = () => {
      const currentTime = audioContextRef.current.currentTime;
      
      // Find notes that are past the hit window and weren't hit
      const missedNotes = notes.filter(note => {
        const noteTime = note.time;
        const timeDiff = currentTime - noteTime;
        const status = noteHitStatusRef.current[note.id];
        
        // Note is missed if it's past the window and wasn't fully processed
        // Add a small buffer to prevent false misses
        return timeDiff > 0.15 && (!status || !status.processed) && timeDiff < 1.0;
      });
      
      if (missedNotes.length > 0) {
        // Reset combo on miss
        setCombo(0);
        setMissedNotes(prev => prev + missedNotes.length);
        
        // Remove missed notes from display
        setNotes(prev => prev.filter(note => 
          !missedNotes.some(missed => missed.id === note.id)
        ));
        
        // Mark as processed so we don't count them again
        missedNotes.forEach(note => {
          if (!noteHitStatusRef.current[note.id]) {
            noteHitStatusRef.current[note.id] = { processed: true };
          } else {
            noteHitStatusRef.current[note.id].processed = true;
          }
        });
      }
      
      requestAnimationFrame(checkMissedNotes);
    };
    
    const missCheckRef = requestAnimationFrame(checkMissedNotes);
    return () => cancelAnimationFrame(missCheckRef);
  }, [gameState, notes]);

  const handleRestart = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
    }
    startGame();
  };

  const handleMenu = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
    }
    setIsFlying(false);
    setGameState('menu');
  };

  const accuracy = (hitNotes + missedNotes) > 0 ? (hitNotes / (hitNotes + missedNotes)) * 100 : 100;

  const whichSprite = (index) => {
    if (index === 0) return CHIIKAWA_SPRITE;
    if (index === 1) return HACHIWARE_SPRITE;
    if (index === 2) return USAGI_SPRITE;
    if (index === 3) return MOMONGA_SPRITE;
  }

  const renderNotes = () => {
    if (!audioContextRef.current) return null;
    
    const currentTime = audioContextRef.current.currentTime;
    
    return (
      <>
        {/* Regular notes */}
        {notes.map(note => {
          // Calculate note position based on precise audio time
          const noteTimeRemaining = note.time - currentTime;
          const noteY = (GAME_HEIGHT - 35) - noteTimeRemaining * NOTE_SPEED;
          
          return note.lanes.map((active, laneIndex) => 
            active && noteY >= 0 && noteY <= GAME_HEIGHT - SPRITE_SIZE && (
              <Box
                key={`${note.id}-${laneIndex}`}
                component="img"
                src={whichSprite(laneIndex)}
                alt="Chiikawa note"
                sx={{
                  position: 'absolute',
                  top: noteY,
                  left: laneIndex * LANE_WIDTH + (LANE_WIDTH - SPRITE_SIZE) / 2,
                  width: SPRITE_SIZE,
                  height: SPRITE_SIZE,
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  transform: `rotate(${noteY}deg)`,
                  transformOrigin: 'center center',
                }}
              />
            )
          );
        })}

        {/* Hit notes with animation */}
        {Object.entries(hitNoteAnimations).map(([noteId, animation]) => {
          const elapsedTime = currentTime - animation.startTime;
          const progress = Math.min(elapsedTime / 0.6, 1);
                    
          return animation.lanes.map((active, laneIndex) => 
            active && (
              <Box
                key={`hit-${noteId}-${laneIndex}`}
                component="img"
                src={whichSprite(laneIndex)}
                alt="Hit Chiikawa note"
                sx={{
                  position: 'absolute',
                  top: animation.hitY,
                  left: laneIndex * LANE_WIDTH + (LANE_WIDTH - SPRITE_SIZE) / 2,
                  width: SPRITE_SIZE,
                  height: SPRITE_SIZE,
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  transform: `
                    scale(${1 + progress * 2})
                    rotate(${animation.hitY}deg)
                  `,
                  opacity: 1 - progress * 1.5,
                  transformOrigin: 'center center',
                  transition: 'transform 0.05s linear',
                }}
              />
            )
          );
        })}
      </>
    );
  };

  const handleStartGame = () => {
    setIsFlying(true);
    setTimeout(() => {
      startGame();
      setIsFlying(false);
    }, 1000);
  };

  return (
    <>
      <CssBaseline />
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(45deg, #FFE5E5 0%, #E5F5FF 100%)',
        overflow: 'hidden',
        position: 'relative',
        padding: 0,
        margin: 0,
        width: '100%',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z\' fill=\'%23FFB6C1\' fill-opacity=\'0.1\' fill-rule=\'evenodd\'/%3E%3C/svg%3E")',
          opacity: 0.5,
          zIndex: 0,
        }
      }}>
        {isLoading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CircularProgress />
            <Typography>Loading audio...</Typography>
          </Box>
        )}

        {!isLoading && gameState === 'menu' && (
          <Box
            onClick={handleStartGame}
            sx={{
              cursor: 'pointer',
              position: isFlying ? 'absolute' : 'relative',
              zIndex: isFlying ? 1000 : 1,
              animation: !isFlying ? 'float 3s ease-in-out infinite' : 'none',
              '@keyframes float': {
                '0%': { transform: 'translateY(0px)' },
                '50%': { transform: 'translateY(-20px)' },
                '100%': { transform: 'translateY(0px)' },
              },
              '&:hover': !isFlying ? {
                '& > img': {
                  animation: 'wiggle 0.5s ease-in-out infinite',
                  filter: 'brightness(1.2)',
                }
              } : {},
              '@keyframes wiggle': {
                '0%': { transform: 'rotate(0deg)' },
                '25%': { transform: 'rotate(-5deg)' },
                '50%': { transform: 'rotate(0deg)' },
                '75%': { transform: 'rotate(5deg)' },
                '100%': { transform: 'rotate(0deg)' },
              },
              transition: isFlying ? 'none' : 'all 0.3s ease-in-out',
            }}
          >
            <Box
              component="img"
              src={CHIIKAWA_SPRITE}
              alt="chiikawa"
              sx={{
                width: 300,
                animation: isFlying ? 'zoomAndFade 0.5s ease-in-out forwards' : 'none',
                '@keyframes zoomAndFade': {
                  '0%': {
                    transform: 'scale(1)',
                    opacity: 1
                  },
                  '100%': {
                    transform: 'scale(20)',
                    opacity: 0
                  }
                },
                willChange: 'transform, opacity',
                transformOrigin: 'center center',
                pointerEvents: isFlying ? 'none' : 'auto',
                position: 'relative',
                zIndex: isFlying ? 1000 : 1,
              }}
            />
          </Box>
        )}

        {gameState === 'playing' && (
          <Box 
            sx={{ 
              position: 'relative', 
              width: LANE_WIDTH * 4, 
              height: GAME_HEIGHT,
              opacity: 1,
              transition: 'opacity 0.3s ease-in-out'
            }}
          >
            {/* Lanes */}
            {LANE_KEYS.map((key, index) => (
              <Box
                key={key}
                sx={{
                  position: 'absolute',
                  left: index * LANE_WIDTH,
                  width: LANE_WIDTH,
                  height: GAME_HEIGHT,
                  bgcolor: pressedKeys.has(key) ? 'rgba(255, 182, 193, 0.3)' : 'rgba(255, 182, 193, 0.1)',
                  border: '2px solid rgba(255, 182, 193, 0.3)',
                  borderRadius: '10px',
                  boxShadow: pressedKeys.has(key) 
                    ? '0 0 20px rgba(255, 182, 193, 0.5)' 
                    : '0 4px 6px rgba(0, 0, 0, 0.1)',
                  transition: 'all 0.05s ease',
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    width: '100%',
                    height: 50,
                    bgcolor: pressedKeys.has(key) ? 'rgba(255, 182, 193, 0.5)' : 'rgba(255, 182, 193, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '0 0 10px 10px',
                    borderTop: '2px solid rgba(255, 182, 193, 0.5)',
                    transition: 'all 0.05s ease',
                  }}
                >
                  <Typography sx={{ 
                    color: '#FF69B4',
                    fontWeight: 'bold',
                    fontSize: '1.2rem',
                    textShadow: pressedKeys.has(key) ? '0 0 10px rgba(255, 105, 180, 0.5)' : '1px 1px 2px rgba(0,0,0,0.1)',
                    transition: 'all 0.05s ease',
                  }}>
                    {key.toUpperCase()}
                  </Typography>
                </Box>
              </Box>
            ))}

            {/* Notes - using our renderNotes helper */}
            {renderNotes()}

            {/* Score and Accuracy */}
            <Box sx={{ 
              position: 'absolute', 
              top: 10, 
              left: 10,
              bgcolor: 'rgba(255, 255, 255, 0.8)',
              padding: '10px 20px',
              borderRadius: '15px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}>
              <Typography sx={{ color: '#FF69B4', fontWeight: 'bold' }}>Score: {score}</Typography>
              <Typography sx={{ color: '#FF69B4', fontWeight: 'bold' }}>Combo: {combo}x</Typography>
              <Typography sx={{ color: '#FF69B4', fontWeight: 'bold' }}>Accuracy: {accuracy.toFixed()}%</Typography>
            </Box>

            {/* Back to menu button */}
            <Button
              onClick={handleMenu}
              color="secondary"
              variant="contained"
              sx={{ 
                position: 'absolute', 
                top: 10, 
                right: 10,
                bgcolor: '#FF69B4',
                '&:hover': {
                  bgcolor: '#FF1493',
                },
                transition: 'all 0.3s ease',
                borderRadius: '20px',
                padding: '10px 20px',
              }}
            >
              <Home />
            </Button>
          </Box>
        )}

        {gameState === 'results' && (
          <Box sx={{ 
            textAlign: 'center',
            bgcolor: 'rgba(255, 255, 255, 0.9)',
            padding: '30px',
            borderRadius: '20px',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.1)',
          }}>
            <Typography variant="h4" sx={{ color: '#FF69B4', fontWeight: 'bold', mb: 2 }}>Results</Typography>
            <Typography variant="h6" sx={{ color: '#FF69B4', mb: 1 }}>Score: {score}</Typography>
            <Typography variant="h6" sx={{ color: '#FF69B4', mb: 1 }}>Accuracy: {accuracy.toFixed()}%</Typography>
            <Typography variant="h6" sx={{ color: '#FF69B4', mb: 3 }}>High Score: {highScore}</Typography>
            
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 2 }}>
              <Button 
                variant="contained" 
                color="primary" 
                onClick={handleRestart}
                startIcon={<Refresh />}
                sx={{
                  bgcolor: '#FF69B4',
                  '&:hover': {
                    bgcolor: '#FF1493',
                    transform: 'scale(1.1)',
                  },
                  transition: 'all 0.3s ease',
                  borderRadius: '20px',
                  padding: '10px 20px',
                }}
              >
                Play Again
              </Button>
              
              <Button 
                variant="outlined" 
                color="secondary" 
                onClick={handleMenu}
                startIcon={<Home />}
                sx={{
                  borderColor: '#FF69B4',
                  color: '#FF69B4',
                  '&:hover': {
                    borderColor: '#FF1493',
                    color: '#FF1493',
                    transform: 'scale(1.1)',
                  },
                  transition: 'all 0.3s ease',
                  borderRadius: '20px',
                  padding: '10px 20px',
                }}
              >
                Menu
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
};

export default App;