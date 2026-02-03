'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function DashboardLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [remoteId, setRemoteId] = useState('');
  const [password, setPassword] = useState('');

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (remoteId.replace(/\s/g, '').length === 9) {
      // In a real app, you would authenticate with the password here.
      // For now, we just navigate.
      router.push(`/session/${remoteId.replace(/\s/g, '')}`);
    } else {
      toast({
        title: 'ID no válido',
        description: 'Por favor, introduce un ID de sesión válido de 9 dígitos.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-12">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="font-headline text-3xl">Bienvenido a TeamDesk</CardTitle>
          <CardDescription>Introduce los detalles de tu sesión para conectarte.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleConnect} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="remote-id">ID de Sesión</Label>
              <Input
                id="remote-id"
                placeholder="p.ej., 123 456 789"
                value={remoteId}
                onChange={(e) => setRemoteId(e.target.value)}
                className="font-code text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remote-password">Contraseña</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="remote-password"
                  type="password"
                  placeholder="Introduce la contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 text-lg"
                />
              </div>
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              Conectar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
