'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RemoteDesktopView from "@/components/session/remote-desktop-view";
import SshTerminalView from "@/components/session/ssh-terminal-view";
import FloatingToolbar from "@/components/session/floating-toolbar";

export default function SessionPage({ params }: { params: { id: string } }) {
  return (
    <div className="relative h-[calc(100vh-3.5rem)] bg-black flex flex-col">
      <FloatingToolbar sessionId={params.id} />
      <div className="flex-1 p-2 sm:p-4 flex flex-col">
        <Tabs defaultValue="desktop" className="w-full h-full flex flex-col">
          <TabsList className="mx-auto w-fit">
            <TabsTrigger value="desktop">Remote Desktop</TabsTrigger>
            <TabsTrigger value="terminal">SSH Terminal</TabsTrigger>
          </TabsList>
          <TabsContent value="desktop" className="flex-1 mt-4 overflow-hidden rounded-lg">
            <RemoteDesktopView />
          </TabsContent>
          <TabsContent value="terminal" className="flex-1 mt-4 overflow-hidden rounded-lg">
            <SshTerminalView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
