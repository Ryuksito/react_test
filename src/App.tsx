import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const wsAudio = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bufferQueue = useRef<ArrayBuffer[]>([]);

  useEffect(() => {
    initWebSocket();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;
    audio.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', () => {
      if (!sourceBufferRef.current) {
        sourceBufferRef.current = mediaSource.addSourceBuffer('audio/mpeg');
        sourceBufferRef.current.addEventListener('updateend', processQueue);
      }
    });
  }, []);

  const initWebSocket = () => {
    wsAudio.current = new WebSocket('ws://localhost:9000/api/chatbot/audio/ws/s2s-generate');

    if (wsAudio.current) {
      wsAudio.current.onopen = () => {
        console.log("WebSocket audio connected");
      };

      wsAudio.current.onmessage = (event: MessageEvent) => {
        const blob = event.data as Blob;
        console.log(`blob type: ${blob.type}`); // Esto debería imprimir "audio/mpeg" o "audio/mp3"

        const reader = new FileReader();
        console.log(`Chunk recibido: ${event.data.size} bytes`);

        reader.onloadend = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          bufferQueue.current.push(arrayBuffer); // Añadir a la cola
          console.log(`Queue length: ${bufferQueue.current.length}`)
          processQueue(); // Procesar cola inmediatamente

          const audio = audioRef.current;
          if (audio) {
            audio.currentTime = 0; // Reiniciar el tiempo de reproducción
            audio.play(); // Reproducir desde el principio
          }
        };

        reader.readAsArrayBuffer(blob);
      };

      wsAudio.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsAudio.current.onclose = () => {
        console.log("WebSocket cerrado");
      };
    }
  };

  const processQueue = () => {
    const sourceBuffer = sourceBufferRef.current;

    if (sourceBuffer && !sourceBuffer.updating && bufferQueue.current.length > 0) {
      const nextBuffer = bufferQueue.current.shift(); // Sacar el siguiente buffer
      console.log("Reproduciendo el siguiente buffer: " + nextBuffer?.byteLength)
      if (nextBuffer) {
        try {
          sourceBuffer.appendBuffer(nextBuffer); // Añadir el siguiente buffer
        } catch (error) {
          console.error('Error al añadir buffer al SourceBuffer:', error);
        }
      }
    }
  };

  const startRecording = async () => {
    console.log("Starting RECORDING\n");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 2,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      recorder.ondataavailable = (event: BlobEvent) => {
        console.log(`Chunk enviado: ${event.data.size} bytes`);
        if (wsAudio.current && event.data.size > 0) {
          wsAudio.current.send(event.data); // Enviar el audio grabado al backend
        }
      };

      recorder.start();
      setMediaStream(stream);
      setMediaRecorder(recorder);
    } catch (error) {
      console.error("Error al acceder al micrófono:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.onstop = () => {
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
        }
      };
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Grabadora y Reproductor de Audio en Tiempo Real</h1>
        <div>
          <button onClick={startRecording} className="btn-record">
            <FontAwesomeIcon icon={faMicrophone} />
          </button>
          <button onClick={stopRecording} className="btn-send">
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </div>
        <audio ref={audioRef} controls autoPlay />
      </header>
    </div>
  );
}

export default App;
