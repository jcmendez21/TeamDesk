"use strict";
/**
 * Wire protocol for messages flowing over the WebRTC RTCDataChannels
 * between the operator (web) and the host (web today, Electron agent next).
 *
 * Each channel carries a single message family — splitting them avoids
 * head-of-line blocking between high-frequency input events and bulk
 * file transfers. The discriminated union below documents what is legal
 * on each channel; the runtime guards in `peer-factory` reject messages
 * that arrive on the wrong channel.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILE_CHUNK_BYTES = void 0;
exports.FILE_CHUNK_BYTES = 64 * 1024;
