"use client";
import { cn } from "@/lib/utils";
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CircleDot } from "lucide-react";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-4 gap-4 max-w-7xl mx-auto ",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  id,
  status
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  id: string;
  status: 'online' | 'offline';
}) => {
  const isOnline = status === 'online';
  return (
    <Link
      href={isOnline ? `/session/${id}` : '#'}
      className={cn(
        "row-span-1 rounded-xl group/bento transition duration-200 shadow-input dark:shadow-none p-4 bg-card border justify-between flex flex-col space-y-4 relative overflow-hidden",
        isOnline ? "cursor-pointer hover:shadow-xl" : "cursor-not-allowed opacity-60",
        className
      )}
    >
      {!isOnline && (
        <div className="absolute inset-0 bg-black/30 z-10 flex items-center justify-center">
            <span className="text-white font-bold">OFFLINE</span>
        </div>
      )}
      <motion.div 
        className="flex-1 w-full h-full min-h-[6rem] rounded-xl overflow-hidden"
        whileHover={{ scale: isOnline ? 1.05 : 1 }}
        transition={{ duration: 0.2 }}
      >
        {header}
      </motion.div>
      <div className="transition duration-200">
        <div className="font-headline font-bold text-card-foreground mb-1 mt-2 flex items-center gap-2">
           <CircleDot className={cn("h-4 w-4", isOnline ? 'text-green-500' : 'text-red-500')} />
          {title}
        </div>
        <div className="font-body font-normal text-muted-foreground text-xs">
          {description}
        </div>
      </div>
    </Link>
  );
};
