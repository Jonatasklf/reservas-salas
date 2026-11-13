'use client';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui';

export function PrintButton() {
  return (
    <Button className="no-print" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden />Imprimir / Salvar PDF
    </Button>
  );
}
