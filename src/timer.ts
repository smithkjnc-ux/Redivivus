// CHASSIS [SCOPE] This module provides a React component for a customizable countdown timer with start, pause, and reset functionalities, and plays an audio cue when time expires.

import React, { useState, useEffect, useRef, useCallback } from 'react';

// GAPS TO FILL WITH NEW CODE:
// - React component for the timer display and controls (start, pause, reset buttons).
// - Countdown logic using `setInterval` and state management for time, status, and initial duration.
// - Function to play a sound when the timer reaches zero.

/**
 * Helper function to format seconds into MM:SS string.
 * @param totalSeconds The total number of seconds.
 * @returns Formatted time string (MM:SS).
 */
const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Plays a sound when the timer reaches zero.
 * [TODO] Replace with a valid audio file path or URL.
 */
const playSound = () => {
  // [TODO] Ensure this path is correct relative to your public directory or asset build process.
  // For example, if you place 'times-up.mp3' in your public folder, it might be '/times-up.mp3'.
  const audio = new Audio('/audio/times-up.mp3'); // Example path
  audio.play().catch(error => {
    console.error("Error playing sound:", error);
    // This often happens if the browser blocks autoplay without user interaction.
    // Consider adding a user interaction trigger for sound if needed in a real app.
  });
};

interface CountdownTimerProps {
  durationInSeconds?: number; // Optional initial duration, defaults to 5 minutes (300 seconds)
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ durationInSeconds = 300 }) => {
  const [initialDuration, setInitialDuration] = useState<number>(durationInSeconds);
  const [timeRemaining, setTimeRemaining] = useState<number>(initialDuration);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const intervalRef = useRef<number | null>(null);

  // Effect for handling the countdown logic
  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      intervalRef.current = window.setInterval(() => {
        setTimeRemaining((prevTime) => prevTime - 1);
      }, 1000);
    } else if (!isRunning && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    } else if (timeRemaining === 0 && isRunning) {
      // Timer reached zero while running
      clearInterval(intervalRef.current!);
      intervalRef.current = null;
      setIsRunning(false);
      playSound();
    }

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, timeRemaining]); // Re-run effect when isRunning or timeRemaining changes

  // Reset initial duration if prop changes
  useEffect(() => {
    setInitialDuration(durationInSeconds);
    setTimeRemaining(durationInSeconds);
    setIsRunning(false); // Stop timer if duration changes
  }, [durationInSeconds]);

  const handleStartPause = useCallback(() => {
    if (timeRemaining === 0) {
      // If timer ended, start from initial duration on first play
      setTimeRemaining(initialDuration);
    }
    setIsRunning((prevIsRunning) => !prevIsRunning);
  }, [timeRemaining, initialDuration]);

  const handleReset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    setTimeRemaining(initialDuration);
  }, [initialDuration]);

  return (
    <div className="countdown-timer" style={{ fontFamily: 'Arial, sans-serif', textAlign: 'center', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', maxWidth: '300px', margin: '20px auto' }}>
      <h2 style={{ fontSize: '2em', marginBottom: '15px' }}>Countdown Timer</h2>
      <div className="time-display" style={{ fontSize: '4em', fontWeight: 'bold', color: '#333', marginBottom: '20px' }}>
        {formatTime(timeRemaining)}
      </div>
      <div className="controls" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
        <button
          onClick={handleStartPause}
          style={{ padding: '10px 20px', fontSize: '1em', cursor: 'pointer', borderRadius: '5px', border: '1px solid #007bff', backgroundColor: '#007bff', color: 'white' }}
        >
          {isRunning ? 'Pause' : (timeRemaining === initialDuration || timeRemaining === 0 ? 'Start' : 'Resume')}
        </button>
        <button
          onClick={handleReset}
          disabled={timeRemaining === initialDuration && !isRunning}
          style={{ padding: '10px 20px', fontSize: '1em', cursor: 'pointer', borderRadius: '5px', border: '1px solid #dc3545', backgroundColor: '#dc3545', color: 'white', opacity: (timeRemaining === initialDuration && !isRunning) ? 0.6 : 1 }}
        >
          Reset
        </button>
      </div>
      {/* [TODO] The sound file needs to be accessible at the specified path (e.g., /public/audio/times-up.mp3) */}
      {/* Example: Create a public/audio directory and place times-up.mp3 inside. */}
    </div>
  );
};

export default CountdownTimer;
// [TODO] To use this component, import it into your main App.tsx or a routing file and render it.
// Example: <CountdownTimer durationInSeconds={60 * 10} /> for a 10-minute timer.
// Example: <CountdownTimer /> for the default 5-minute timer.