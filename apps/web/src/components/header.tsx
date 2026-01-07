"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { ArrowRight, Settings, User } from "lucide-react";
import { HeaderBase } from "./header-base";
import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function Header() {
  const leftContent = (
    <Link href="/" className="flex items-center gap-3">
      <Image
        src="/logo.svg"
        alt="OpenCut Logo"
        className="invert dark:invert-0"
        width={32}
        height={32}
      />
      <span className="text-xl font-medium hidden md:block">OpenCut</span>
    </Link>
  );

  const rightContent = (
    <nav className="flex items-center gap-2">
      <div className="flex items-center gap-4">
        <Link href="/blog">
          <Button variant="text" className="text-sm p-0">
            Blog
          </Button>
        </Link>
        <Link href="/contributors">
          <Button variant="text" className="text-sm p-0">
            Contributors
          </Button>
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/library">
          <Button variant="text" className="text-sm p-0">
            Library
          </Button>
        </Link>
        <Link href="/projects">
          <Button size="sm" className="text-sm">
            Projects
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:block">Account</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link
              href="/config"
              className="flex items-center gap-2 cursor-pointer"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              if (typeof window !== "undefined") {
                window.open("https://github.com/opencut/opencut", "_blank");
              }
            }}
          >
            GitHub Repository
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ThemeToggle className="mr-2" />
    </nav>
  );

  return (
    <div className="sticky top-4 z-50 mx-4 md:mx-0">
      <HeaderBase
        className="bg-background border rounded-2xl max-w-3xl mx-auto mt-4 pl-4 pr-[11px]"
        leftContent={leftContent}
        rightContent={rightContent}
      />
    </div>
  );
}
