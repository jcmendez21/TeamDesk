'use client';

import { useRouter } from 'next/navigation';
import { Keyboard, Monitor, Clipboard, Power, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from '@/hooks/use-toast';

export default function FloatingToolbar({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const handleDisconnect = () => {
    router.push('/dashboard');
  };

  const handleClipboardSync = async () => {
    try {
        await navigator.clipboard.readText();
        // In a real app, you'd send this text over the WebRTC data channel
        toast({
            title: "Clipboard Synced",
            description: "Remote clipboard has been updated.",
        });
    } catch (err) {
        toast({
            title: "Clipboard Error",
            description: "Could not read clipboard. Please grant permissions.",
            variant: "destructive",
        });
    }
  };

  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 120 }}
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20"
    >
      <div className="flex items-center gap-2 p-2 bg-card/80 backdrop-blur-md rounded-full border shadow-lg">
        <span className="text-sm font-medium text-muted-foreground px-3 hidden sm:inline">
          Session: {sessionId}
        </span>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                 <Button variant="ghost" size="icon" className="rounded-full">
                    <Settings className="h-5 w-5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
                <DropdownMenuLabel>Session Controls</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                    <Keyboard className="mr-2 h-4 w-4" />
                    <span>Send Keystrokes</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClipboardSync}>
                    <Clipboard className="mr-2 h-4 w-4" />
                    <span>Sync Clipboard</span>
                </DropdownMenuItem>
                 <DropdownMenuItem>
                    <Monitor className="mr-2 h-4 w-4" />
                    <span>Switch Monitor</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="destructive" size="icon" className="rounded-full" onClick={handleDisconnect}>
          <Power className="h-5 w-5" />
        </Button>
      </div>
    </motion.div>
  );
}
