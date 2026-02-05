import { useEffect, useRef, useState, useCallback } from 'react';
import { Instance as PeerInstance, SignalData } from 'simple-peer';
import { getSocket } from '@/lib/socket';

interface UseWebRTCOptions {
    isInitiator: boolean;
    roomId: string;
    onStream?: (stream: MediaStream) => void;
    onData?: (data: any) => void;
    stream?: MediaStream | null; // Local stream to send
}

export const useWebRTC = ({ isInitiator, roomId, onStream, onData, stream }: UseWebRTCOptions) => {
    const [isConnected, setIsConnected] = useState(false);
    const isConnectedRef = useRef(false);
    const socket = getSocket();
    const peerRef = useRef<PeerInstance | null>(null);

    // Use refs for callbacks to avoid re-initializing peer on prop change
    const onStreamRef = useRef(onStream);
    const onDataRef = useRef(onData);

    useEffect(() => {
        onStreamRef.current = onStream;
        onDataRef.current = onData;
    }, [onStream, onData]);

    const createPeer = (initiator: boolean, currentStream: MediaStream | null | undefined) => {
        if (peerRef.current) {
            peerRef.current.destroy();
        }

        const Peer = require('simple-peer');
        console.log(`[WebRTC] Creating new Peer. Initiator: ${initiator}`);

        const p = new Peer({
            initiator: initiator,
            trickle: true,
            stream: currentStream || undefined,
            config: {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            },
            offerOptions: {
                offerToReceiveVideo: true,
                offerToReceiveAudio: true
            }
        });

        // Some versions of simple-peer prefer explicit stream addition
        if (currentStream && !initiator) {
            console.log("[WebRTC] Ensuring stream tracks are added to peer");
        }

        if (currentStream) {
            console.log(`[WebRTC] Adding local stream to Peer: ${currentStream.id}. Active: ${currentStream.active}`);
            currentStream.getTracks().forEach(track => {
                console.log(`[WebRTC] Track: ${track.kind}, Enabled: ${track.enabled}, State: ${track.readyState}`);
            });
        }

        p.on('signal', (data: SignalData) => {
            const payload = { target: roomId, signal: data, caller: socket.id };
            if (data.type === 'offer') socket.emit('offer', payload);
            else if (data.type === 'answer') socket.emit('answer', payload);
            else socket.emit('ice-candidate', payload);
        });

        p.on('connect', () => {
            console.log('[WebRTC] Connection Established');
            setIsConnected(true);
            isConnectedRef.current = true;
        });

        p.on('data', (data: any) => {
            const decoded = new TextDecoder().decode(data);
            try {
                const json = JSON.parse(decoded);
                onDataRef.current?.(json);
            } catch (e) {
                console.error('Failed to parse data:', e);
            }
        });

        p.on('stream', (remoteStream: MediaStream) => {
            console.log(`[WebRTC] Received Remote Stream: ${remoteStream.id}. Active: ${remoteStream.active}`);
            remoteStream.getTracks().forEach(track => {
                console.log(`[WebRTC] Remote Track: ${track.kind}, Enabled: ${track.enabled}, State: ${track.readyState}`);
            });
            onStreamRef.current?.(remoteStream);
        });

        p.on('error', (err: any) => {
            console.error('[WebRTC] Peer Error:', err);
            if (err.code === 'ERR_CONNECTION_FAILURE' || err.message?.includes('failed')) {
                console.log("[WebRTC] Connection failed, attempting reset...");
                setIsConnected(false);
                isConnectedRef.current = false;
                // Allow next OFFER to reset us
            }
        });

        p.on('close', () => {
            console.log('[WebRTC] Connection Closed');
            setIsConnected(false);
            isConnectedRef.current = false;
        });

        peerRef.current = p;
        return p;
    };

    useEffect(() => {
        if (!roomId) return;
        if (!socket.connected) socket.connect();

        const handleSignal = (data: { signal: SignalData, caller: string }) => {
            if (!isInitiator && data.signal.type === 'offer') {
                // If we receive an OFFER as Non-Initiator, it's a new connection attempt.
                // We should ALWAYS reset our peer to match the Remote's fresh state.
                console.log("[WebRTC] Received OFFER. (Re)setting peer to accept.");
                createPeer(false, stream);
            }

            const peer = peerRef.current;
            if (peer && !peer.destroyed) {
                try {
                    peer.signal(data.signal);
                } catch (err: any) {
                    if (err.message?.includes('renegotiate')) return;
                    console.error("Error signaling peer:", err);
                }
            }
        };

        const handleIceCandidate = (data: { signal: any }) => {
            const peer = peerRef.current;
            if (peer && !peer.destroyed) {
                try {
                    peer.signal(data.signal);
                } catch (err: any) {
                    if (err.message?.includes('renegotiate')) return;
                    console.error("Error signaling candidate:", err);
                }
            }
        };

        // Attach listeners BEFORE joining room to catch early offers/candidates
        socket.on('offer', handleSignal);
        socket.on('answer', handleSignal);
        socket.on('ice-candidate', handleIceCandidate);

        console.log(`[WebRTC] Joining room ${roomId} as ${isInitiator ? 'Initiator' : 'Peer'}`);
        socket.emit('join-room', roomId);

        if (!peerRef.current) {
            createPeer(isInitiator, stream);
        }

        return () => {
            console.log(`[WebRTC] Cleaning up room ${roomId}`);
            socket.off('offer', handleSignal);
            socket.off('answer', handleSignal);
            socket.off('ice-candidate', handleIceCandidate);
            if (peerRef.current) {
                peerRef.current.destroy();
                peerRef.current = null;
            }
            setIsConnected(false);
        };
    }, [isInitiator, roomId, stream]);

    const sendData = useCallback((data: any) => {
        const peer = peerRef.current;
        if (peer && !peer.destroyed && isConnected) {
            try {
                peer.send(JSON.stringify(data));
            } catch (err) {
                console.error("Error sending data:", err);
            }
        }
    }, [isConnected]);

    return { isConnected, sendData };
};
