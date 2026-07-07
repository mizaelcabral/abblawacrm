'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Package,
  FileText,
  Settings,
} from 'lucide-react';

interface SubNavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const subNavItems: SubNavItem[] = [
  { href: '/ecommerce', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/ecommerce/products', label: 'Catálogo de Produtos', icon: Package },
  { href: '/ecommerce/orders', label: 'Pedidos', icon: FileText },
];

export default function EcommerceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col space-y-2 border-b border-border pb-5 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Gestão da Loja & E-commerce
          </h1>
          <p className="text-sm text-muted-foreground">
            Administre seus produtos físicos ou digitais, configure formas de entrega, upsells e gerencie seus pagamentos Woovi.
          </p>
        </div>
      </div>

      {/* Navegação Secundária (Sub-abas) */}
      <div className="flex border-b border-border overflow-x-auto pb-px">
        <nav className="flex space-x-6 min-w-max px-1">
          {subNavItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center space-x-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus-visible:outline-none',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="min-h-[500px]">{children}</div>
    </div>
  );
}
