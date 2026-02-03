"use client";

import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

export default function SshTerminalView() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (terminalRef.current && !isInitialized.current) {
      isInitialized.current = true;
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: "'Source Code Pro', monospace",
        fontSize: 14,
        theme: {
          background: '#000000',
          foreground: '#ffffff',
          cursor: '#FF7043',
          selectionBackground: 'rgba(255, 112, 67, 0.3)',
        },
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();

      term.writeln('Welcome to TeamDesk SSH Terminal!');
      term.writeln('Connecting to remote host...');
      term.write('$ ');

      term.onData(e => {
        if (e === '\r') { // On Enter
           term.writeln('');
           term.write('$ ');
        } else if (e === '\u007F') { // Backspace
          if (term.buffer.active.cursorX > 2) {
            term.write('\b \b');
          }
        }
        else {
          term.write(e);
        }
      });
      
      const handleResize = () => {
        fitAddon.fit();
      };
      
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(terminalRef.current);
      
      return () => {
          resizeObserver.disconnect();
          term.dispose();
      };
    }
  }, []);

  return <div ref={terminalRef} className="w-full h-full font-code" />;
}
