import { BentoGrid, BentoGridItem } from "@/components/dashboard/bento-grid";
import { PlaceHolderImages } from "@/lib/placeholder-images";

const machines = [
  {
    id: '123456789',
    title: "DevBox-01 (Ubuntu)",
    description: "Primary development machine.",
    status: "online" as "online" | "offline",
    header: <img src={PlaceHolderImages.find(i => i.id === 'machine-1')?.imageUrl} alt="DevBox" className="w-full h-full object-cover" data-ai-hint="desktop code" />,
    className: "md:col-span-2",
  },
  {
    id: '987654321',
    title: "DesignStation (MacOS)",
    description: "UI/UX design workstation.",
    status: "online" as "online" | "offline",
    header: <img src={PlaceHolderImages.find(i => i.id === 'machine-2')?.imageUrl} alt="DesignStation" className="w-full h-full object-cover" data-ai-hint="desktop design" />,
    className: "md:col-span-1",
  },
  {
    id: '112233445',
    title: "Staging-Server",
    description: "CentOS server for testing deployments.",
    status: "offline" as "online" | "offline",
    header: <img src={PlaceHolderImages.find(i => i.id === 'machine-3')?.imageUrl} alt="Staging Server" className="w-full h-full object-cover" data-ai-hint="server data-center" />,
    className: "md:col-span-1",
  },
  {
    id: '556677889',
    title: "Marketing-Laptop (Win11)",
    description: "General purpose laptop.",
    status: "online" as "online" | "offline",
    header: <img src={PlaceHolderImages.find(i => i.id === 'machine-4')?.imageUrl} alt="Marketing Laptop" className="w-full h-full object-cover" data-ai-hint="laptop desk" />,
    className: "md:col-span-2",
  },
  {
    id: '998877665',
    title: "User-PC-783",
    description: "Remote user machine.",
    status: "offline" as "online" | "offline",
    header: <img src={PlaceHolderImages.find(i => i.id === 'machine-5')?.imageUrl} alt="User PC" className="w-full h-full object-cover" data-ai-hint="person computer" />,
    className: "md:col-span-2",
  },
];

export default function DashboardPage() {
  return (
    <div className="container py-12">
       <div className="mb-8">
        <h1 className="font-headline text-4xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          An overview of your connected machines. Click a machine to connect.
        </p>
      </div>
      <BentoGrid className="mx-auto md:grid-cols-4">
        {machines.map((item, i) => (
          <BentoGridItem
            key={i}
            id={item.id}
            title={item.title}
            description={item.description}
            header={item.header}
            status={item.status}
            className={item.className}
          />
        ))}
      </BentoGrid>
    </div>
  );
}
