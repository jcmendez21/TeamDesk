'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { BentoGrid, BentoGridItem } from '@/components/dashboard/bento-grid';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle } from 'lucide-react';

// Firestore machine data type
interface Machine {
  id: string;
  name: string;
  description: string;
  connectionId: string;
  status: 'online' | 'offline';
  userId: string;
}

const addMachineSchema = z.object({
  name: z.string().min(1, 'Machine name is required.'),
  description: z.string().optional(),
});

// Mock data for recent sessions
const recentSessions = [
  { id: 1, sessionId: 'S3S-7A9-3B1', machineName: 'Workstation-01', date: '2024-07-28', duration: '1h 24m' },
  { id: 2, sessionId: 'K8D-4F2-9C5', machineName: 'Design-PC', date: '2024-07-28', duration: '45m' },
  { id: 3, sessionId: 'P5G-1H8-6J0', machineName: 'Home-Server', date: '2024-07-27', duration: '5h 12m' },
  { id: 4, sessionId: 'L2N-9B4-8D7', machineName: 'MacBook-Pro', date: '2024-07-26', duration: '3h 30m' },
];

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [isAddMachineOpen, setIsAddMachineOpen] = useState(false);

  const machinesQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return collection(firestore, 'users', user.uid, 'machines');
  }, [user, firestore]);

  const { data: machines, isLoading: machinesLoading } = useCollection<Machine>(machinesQuery);

  const form = useForm<z.infer<typeof addMachineSchema>>({
    resolver: zodResolver(addMachineSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, user, router]);
  
  async function onAddMachine(values: z.infer<typeof addMachineSchema>) {
    if (!user || !machinesQuery) return;
    
    const connectionId = Math.floor(100_000_000 + Math.random() * 900_000_000).toString();

    const newMachine = {
      name: values.name,
      description: values.description || '',
      connectionId,
      userId: user.uid,
      status: 'offline', // Default status
    };

    addDocumentNonBlocking(machinesQuery, newMachine);
    toast({
        title: 'Machine Added',
        description: `The machine "${values.name}" has been added.`,
    });
    form.reset();
    setIsAddMachineOpen(false);
  }

  const totalLoading = isUserLoading || (user && machinesLoading);

  if (totalLoading) {
    return <DashboardLoadingSkeleton />;
  }

  if (!user) {
    return null; // Or a redirect component
  }

  return (
    <div className="container py-12">
      <div className="flex justify-between items-center mb-12">
        <div className="text-left">
          <h1 className="font-headline text-4xl font-bold tracking-tight lg:text-5xl">
            Welcome, {user.email?.split('@')[0]}
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Manage your machines and view recent activity.
          </p>
        </div>
        <Dialog open={isAddMachineOpen} onOpenChange={setIsAddMachineOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add New Machine
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add a New Machine</DialogTitle>
              <DialogDescription>
                Save a new machine to your account for easy access later.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onAddMachine)} className="space-y-4 py-4">
                 <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Machine Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., My Work Laptop" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="e.g., Main development machine running Ubuntu" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <DialogFooter>
                    <Button type="submit">Save Machine</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <h2 className="font-headline text-3xl font-bold mb-6">My Machines</h2>
      {machines && machines.length > 0 ? (
        <BentoGrid className="mx-auto max-w-none">
            {machines.map((item, i) => {
                 const placeholder = PlaceHolderImages[i % PlaceHolderImages.length];
                 const header = (
                     <Image
                         src={placeholder.imageUrl}
                         alt={item.name}
                         fill
                         className="object-cover"
                         data-ai-hint={placeholder.imageHint}
                     />
                 );
                return (
                    <BentoGridItem
                        key={item.id}
                        id={item.connectionId}
                        title={item.name}
                        description={item.description}
                        header={header}
                        status={item.status as 'online' | 'offline'}
                        className={'md:col-span-2'}
                    />
                )
            })}
        </BentoGrid>
      ) : (
        <Card className="text-center py-12">
            <CardContent className="pt-6">
                <h3 className="text-xl font-semibold">No Machines Yet</h3>
                <p className="text-muted-foreground mt-2">Click "Add New Machine" to get started.</p>
            </CardContent>
        </Card>
      )}

      <div className="mt-16">
        <h2 className="font-headline text-3xl font-bold mb-6">Recent Sessions</h2>
        <Card>
            <CardContent className="pt-6">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Session ID</TableHead>
                            <TableHead>Machine</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Duration</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {recentSessions.map((session) => (
                        <TableRow key={session.id}>
                            <TableCell className="font-medium font-code">{session.sessionId}</TableCell>
                            <TableCell className="font-medium">{session.machineName}</TableCell>
                            <TableCell>{session.date}</TableCell>
                            <TableCell className="text-right">{session.duration}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardLoadingSkeleton() {
    return (
        <div className="container py-12">
            <div className="flex justify-between items-center mb-12">
                <div className="space-y-2">
                    <Skeleton className="h-12 w-80" />
                    <Skeleton className="h-6 w-96" />
                </div>
                <Skeleton className="h-10 w-44" />
            </div>

            <Skeleton className="h-8 w-64 mb-6" />
            <div className="grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-4 gap-4">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className={cn('row-span-1 rounded-xl p-4 bg-card border flex flex-col space-y-4', 'md:col-span-2')}>
                        <Skeleton className="flex-1 w-full h-full min-h-[6rem] rounded-xl" />
                        <div className="space-y-2">
                           <Skeleton className="h-6 w-3/4" />
                           <Skeleton className="h-4 w-full" />
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-16">
                 <Skeleton className="h-8 w-64 mb-6" />
                 <Card>
                     <CardContent className="pt-6">
                         <div className="space-y-4">
                            <div className="flex justify-between items-center h-8 px-4">
                                <Skeleton className="w-1/4 h-5" />
                                <Skeleton className="w-1/4 h-5" />
                                <Skeleton className="w-1/4 h-5" />
                                <Skeleton className="w-1/4 h-5" />
                            </div>
                            <div className="border-t"></div>
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="flex justify-between items-center h-10 px-4 border-b">
                                    <Skeleton className="w-1/4 h-5" />
                                    <Skeleton className="w-1/4 h-5" />
                                    <Skeleton className="w-1/4 h-5" />
                                    <Skeleton className="w-1/4 h-5" />
                                </div>
                            ))}
                         </div>
                     </CardContent>
                 </Card>
            </div>
        </div>
    )
}
