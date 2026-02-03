'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { BentoGrid, BentoGridItem } from '@/components/dashboard/bento-grid';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';

const machines = [
  {
    id: '123456789',
    title: 'Workstation-01',
    description: 'Main development machine with Ubuntu 22.04.',
    header: (
      <Image
        src={PlaceHolderImages[0].imageUrl}
        alt={PlaceHolderImages[0].description}
        fill
        className="object-cover"
        data-ai-hint={PlaceHolderImages[0].imageHint}
      />
    ),
    status: 'online',
  },
  {
    id: '987654321',
    title: 'Design-PC',
    description: 'Windows 11 PC for creative work.',
    header: (
      <Image
        src={PlaceHolderImages[1].imageUrl}
        alt={PlaceHolderImages[1].description}
        fill
        className="object-cover"
        data-ai-hint={PlaceHolderImages[1].imageHint}
      />
    ),
    status: 'offline',
  },
  {
    id: '112233445',
    title: 'Home-Server',
    description: 'Plex and file storage server.',
    header: (
      <Image
        src={PlaceHolderImages[2].imageUrl}
        alt={PlaceHolderImages[2].description}
        fill
        className="object-cover"
        data-ai-hint={PlaceHolderImages[2].imageHint}
      />
    ),
    status: 'online',
  },
  {
    id: '556677889',
    title: 'MacBook-Pro',
    description: 'Portable work laptop.',
     header: (
      <Image
        src={PlaceHolderImages[3].imageUrl}
        alt={PlaceHolderImages[3].description}
        fill
        className="object-cover"
        data-ai-hint={PlaceHolderImages[3].imageHint}
      />
    ),
    status: 'offline',
  },
];


export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading) {
    return <DashboardLoadingSkeleton />;
  }

  if (!user) {
    return null; // Or a redirect component
  }

  return (
    <div className="container py-12">
       <div className="text-center mb-12">
        <h1 className="font-headline text-4xl font-bold tracking-tight lg:text-5xl">
          Welcome, {user.email}
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
          Select a machine to start a new session.
        </p>
      </div>
      <BentoGrid className="mx-auto max-w-4xl">
        {machines.map((item, i) => (
          <BentoGridItem
            key={i}
            id={item.id}
            title={item.title}
            description={item.description}
            header={item.header}
            status={item.status as 'online' | 'offline'}
            className={i === 2 || i === 3 ? 'md:col-span-2' : ''}
          />
        ))}
      </BentoGrid>
    </div>
  );
}


function DashboardLoadingSkeleton() {
    return (
        <div className="container py-12">
            <div className="text-center mb-12">
                <Skeleton className="h-12 w-1/2 mx-auto" />
                <Skeleton className="h-6 w-3/4 mx-auto mt-4" />
            </div>
            <div className="grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className={cn('row-span-1 rounded-xl p-4 bg-card border flex flex-col space-y-4', i === 2 || i === 3 ? 'md:col-span-2' : '')}>
                        <Skeleton className="flex-1 w-full h-full min-h-[6rem] rounded-xl" />
                        <div className="space-y-2">
                           <Skeleton className="h-6 w-3/4" />
                           <Skeleton className="h-4 w-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
