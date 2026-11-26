/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { RestAPI } from "@webpack/common";

export default definePlugin({
    name: "FakeSoundboard",
    description: "Allows you to use soundboard without nitro! (Vesktop/Web only)",
    authors: [{ name: "julia", id: 0n }],

    patches: [
        {
            // Premium feature table: make the soundboard checks always pass.
            find: "canUseSoundboardEverywhere:",
            replacement: [{
                match: /(?<=canUseSoundboardEverywhere:)\i\.\i/,
                replace: "()=>true"
            }, {
                match: /(?<=canUseCustomCallSounds:)\i\.\i/,
                replace: "()=>true"
            }]
        },
        {
            // Microphone hook: acquire is a class method in current Discord
            find: "window.webkitAudioContext",
            replacement: {
                match: /(?<=acquire\((\i)\)\{return )navigator\.mediaDevices\.getUserMedia\(\1\)(?=\})/,
                replace: "$&.then(stream => $self.connectSoundboard(stream, $1.audio))"
            }
        }
    ],

    originalPost: null as null | ((...args: any[]) => Promise<any>),

    // Instead of patching Discord's click handler, watch the request Discord sends
    // when you click a sound. If the server refuses it (403, no Nitro), play the
    // sound into your own mic mix instead.
    start() {
        const api = RestAPI as any;
        const original = api.post;
        this.originalPost = original;

        api.post = (req: any, ...rest: any[]) => {
            const promise = original.call(api, req, ...rest);
            try {
                const url = typeof req === "string" ? req : req?.url;
                if (typeof url === "string" && /\/channels\/\d+\/send-soundboard-sound$/.test(url)) {
                    const soundId = req?.body?.sound_id;
                    console.log("[FakeSoundboard] soundboard request", soundId);
                    if (soundId && typeof promise?.catch === "function") {
                        return promise.catch((err: any) => {
                            console.log("[FakeSoundboard] server replied", err?.status);
                            if (err?.status === 403) this.onPlaySound({ soundId });
                            throw err;
                        });
                    }
                }
            } catch (err) {
                console.error("[FakeSoundboard] request hook failed:", err);
            }
            return promise;
        };
    },

    stop() {
        if (this.originalPost) {
            (RestAPI as any).post = this.originalPost;
            this.originalPost = null;
        }
    },

    // Every mic stream Discord asks for gets its own mixer session.
    // Discord requested the mic twice, and we can't know which stream is the one
    // sent to the call, so sounds are played into all live sessions.
    sessions: new Set<{ ctx: AudioContext; destination: MediaStreamAudioDestinationNode; }>(),

    onPlaySound(sound: { soundId?: string; volume?: number; }) {
        if (!sound?.soundId) return;
        this.playSound(`https://cdn.discordapp.com/soundboard-sounds/${sound.soundId}`, sound.volume);
    },

    async playSound(url: string, volume?: number) {
        try {
            console.log("[FakeSoundboard] playSound", url, "sessions:", this.sessions.size);
            if (this.sessions.size === 0) {
                console.warn("[FakeSoundboard] No active mic session. Rejoin the voice channel.");
                return;
            }

            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buffer = await res.arrayBuffer();

            const [first] = this.sessions;
            const audioBuffer = await first.ctx.decodeAudioData(buffer);

            for (const { ctx, destination } of this.sessions) {
                if (ctx.state === "suspended") await ctx.resume();

                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;

                const gain = ctx.createGain();
                gain.gain.value = typeof volume === "number" ? volume : 1;

                source.connect(gain);
                gain.connect(destination);
                source.start(0, 0, 20); // 20 seconds max
            }
        } catch (err) {
            console.error("[FakeSoundboard] Failed to play sound:", err);
        }
    },

    async connectSoundboard(stream: MediaStream, isAudio: boolean): Promise<MediaStream> {
        if (!isAudio) return stream;
        console.log("[FakeSoundboard] connectSoundboard", stream);

        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const destination = ctx.createMediaStreamDestination();
        source.connect(destination);

        const session = { ctx, destination };
        this.sessions.add(session);

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;

            this.sessions.delete(session);
            try { source.disconnect(); } catch { }
            stream.getTracks().forEach(t => t.stop()); // release the real mic
            ctx.close().catch(() => { });
        };

        // Discord stops the stream we return, so hook stop() on its tracks
        const outStream = destination.stream;
        outStream.getTracks().forEach(track => {
            const originalStop = track.stop.bind(track);
            track.stop = () => {
                originalStop();
                cleanup();
            };
        });

        stream.addEventListener("inactive", cleanup, { once: true });

        return outStream;
    },
});
