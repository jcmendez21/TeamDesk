
"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, ArrowRight, PlusCircle, Clock, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, addDocumentNonBlocking, useMemoFirebase, useCollection } from "@/firebase";
import { collection, query, orderBy } from "firebase/firestore";
import { useRecentConnections } from "@/hooks/use-recent-connections";
import HostSessionHandler from "@/components/session/host-session-handler";

export default function Home() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const [localId, setLocalId] = useState(".........");
  const [localPassword, setLocalPassword] = useState("******");
  const [remoteId, setRemoteId] = useState("");
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);

  const { recents, addRecent } = useRecentConnections();

  useEffect(() => {
    const newId = Math.floor(100_000_000 + Math.random() * 900_000_000).toString();
    setLocalId(newId.replace(/(\d{3})(?=\d)/g, '$1 '));

    const newPassword = Math.random().toString(36).substring(2, 8);
    setLocalPassword(newPassword);
  }, []);

  const machinesCollection = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, `users/${user.uid}/machines`);
  }, [user, firestore]);

  const savedMachinesQuery = useMemoFirebase(() => {
    if (!machinesCollection) return null;
    return query(machinesCollection, orderBy("name"));
  }, [machinesCollection]);

  const { data: savedMachines } = useCollection(savedMachinesQuery);

  const filteredRecents = recents.filter(recent => {
    // Exclude if it's in saved machines
    if (!savedMachines) return true;
    return !savedMachines.some(saved => saved.connectionId === recent.id);
  });

  const handleAddThisMachine = async () => {
    if (!machinesCollection || !user) {
      toast({
        title: "Not Logged In",
        description: "You must be logged in to add a machine.",
        variant: "destructive",
      });
      return;
    }

    const newMachine = {
      name: 'This PC', // Default name, user can change it in dashboard
      description: 'Added from the home page.',
      connectionId: localId.replace(/\s/g, ''),
      userId: user.uid,
      status: 'offline', // Default to offline, a real agent would set this to online
    };

    addDocumentNonBlocking(machinesCollection, newMachine);

    toast({
      title: "Machine Added",
      description: "This PC has been added to your dashboard.",
    });
  };

  const handleStartSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      setHostStream(stream);

      stream.getVideoTracks()[0].onended = () => {
        setHostStream(null);
      };
    } catch (err) {
      console.error("Error sharing screen:", err);
      toast({
        title: "Sharing Cancelled",
        description: "Could not start screen sharing.",
        variant: "destructive"
      });
    }
  };

  const handleConnect = (e: FormEvent) => {
    e.preventDefault();
    if (remoteId.replace(/\s/g, "").length === 9) {
      const cleanId = remoteId.replace(/\s/g, "");
      addRecent(cleanId);
      router.push(`/session/${cleanId}`);
    } else {
      toast({
        title: "Invalid ID",
        description: "Please enter a valid 9-digit session ID.",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ''));
    toast({
      title: `${type} Copied`,
      description: `Your ${type.toLowerCase()} has been copied to the clipboard.`,
    });
  };

  return (
    <div className="container py-12">
      <div className="text-center">
        <h1 className="font-headline text-4xl font-bold tracking-tight lg:text-5xl">
          Seamless Remote Access
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
          Your secure gateway to remote desktops and terminals. Share your session or connect to a colleague instantly.
        </p>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2 lg:gap-12">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Share Your Session</CardTitle>
            <CardDescription>
              Provide this ID and password to the person connecting to you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="your-id">Your 9-Digit ID</Label>
              <div className="flex items-center gap-2">
                <Input id="your-id" value={localId} readOnly className="font-code text-lg tracking-wider" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(localId, 'ID')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="your-password">One-Time Password</Label>
              <div className="flex items-center gap-2">
                <Input id="your-password" value={localPassword} readOnly className="font-code text-lg" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(localPassword, 'Password')}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {user && (
              <Button onClick={handleAddThisMachine} className="w-full mt-4">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add this PC to My Machines
              </Button>
            )}

            {!hostStream ? (
              <Button
                onClick={handleStartSharing}
                className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Start Broadcasting Using WebRTC
              </Button>
            ) : (
              <div className="text-center text-sm text-green-600 font-medium mt-2 animate-pulse">
                Broadcasting Active
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Connect to a Remote Machine</CardTitle>
            <CardDescription>
              Enter the session ID and password from your colleague.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConnect} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="remote-id">Remote Session ID</Label>
                <Input
                  id="remote-id"
                  placeholder="e.g., 123 456 789"
                  value={remoteId}
                  onChange={(e) => setRemoteId(e.target.value)}
                  className="font-code text-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remote-password">Password</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input id="remote-password" type="password" placeholder="Enter password" className="pl-10" />
                </div>
              </div>
              <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                Connect <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2 lg:gap-12">
        {/* Recent Connections Section */}
        {filteredRecents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Connections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filteredRecents.map((recent) => (
                  <div
                    key={recent.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setRemoteId(recent.id)}
                  >
                    <div className="font-code text-lg">
                      {recent.id.replace(/(\d{3})(?=\d)/g, '$1 ')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(recent.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Saved Machines Section (Only if logged in) */}
        {user && savedMachines && savedMachines.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Laptop className="h-5 w-5" />
                My Machines
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {savedMachines.map((machine: any) => (
                  <div
                    key={machine.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setRemoteId(machine.connectionId)}
                  >
                    <div>
                      <div className="font-semibold">{machine.name}</div>
                      <div className="text-sm text-muted-foreground font-code">
                        {machine.connectionId.replace(/(\d{3})(?=\d)/g, '$1 ')}
                      </div>
                    </div>
                    <div className={`h-2 w-2 rounded-full ${machine.status === 'online' ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {hostStream && localId && (
        <HostSessionHandler roomId={localId.replace(/\s/g, '')} stream={hostStream as MediaStream} />
      )}
    </div>
  );
}
