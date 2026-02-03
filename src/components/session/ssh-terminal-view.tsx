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
      term.writeln('Attempting to connect to remote host...');

      let command = '';

      const prompt = () => {
        command = '';
        term.write('\r\n\x1b[32muser@remote-machine\x1b[0m:\x1b[34m~$\x1b[0m ');
      }
      
      const simulateConnection = () => {
        term.writeln('\x1b[32mConnection established.\x1b[0m');
        term.writeln(`Last login: ${new Date().toUTCString()} on pts/0`);
        prompt();
      };
      
      const connectionTimeout = setTimeout(simulateConnection, 2000);

      const dataListener = term.onData(e => {
        if (e === '\r') { // On Enter
           term.writeln('');
           const trimmedCommand = command.trim();
           if (trimmedCommand === 'ls -la') {
             term.writeln('total 12');
             term.writeln('drwxr-xr-x 2 user user 4096 Jan 1 12:00 .');
             term.writeln('drwxr-xr-x 4 user user 4096 Jan 1 12:00 ..');
             term.writeln('-rw-r--r-- 1 user user 1024 Jan 1 12:00 file1.txt');
             term.writeln('-rw-r--r-- 1 user user 2048 Jan 1 12:00 file2.log');
           } else if (trimmedCommand === 'uname -a') {
             term.writeln('Linux remote-machine 5.15.0-78-generic #85-Ubuntu SMP x86_64 x86_64 x86_64 GNU/Linux');
           } else if (trimmedCommand === 'help') {
             term.writeln('Available commands: ls -la, uname -a, help, clear');
           } else if (trimmedCommand === 'clear') {
             term.clear();
           } else if (trimmedCommand) {
             term.writeln(`-bash: ${trimmedCommand}: command not found`);
           }
           prompt();
        } else if (e === '\u007F') { // Backspace
          if (command.length > 0) {
            term.write('\b \b');
            command = command.slice(0, -1);
          }
        } else if (e >= ' ') { // Printable characters
          command += e;
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
          dataListener.dispose();
          clearTimeout(connectionTimeout);
          term.dispose();
      };
    }
  }, []);

  return <div ref={terminalRef} className="w-full h-full font-code" />;
}
