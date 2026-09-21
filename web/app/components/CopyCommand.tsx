'use client';

import { useEffect, useRef, useState } from 'react';

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="5.25" y="5.25" width="8" height="9.5" rx="1.5" />
      <path d="M10.75 5.25V2.75a1.5 1.5 0 0 0-1.5-1.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

/**
 * The primary CTA. Previously this was an "Install Free" button pointing at the
 * same README as the GitHub link beside it, so the two did the same thing. The
 * install line is short enough to just hand over.
 */
export function CopyCommand({
  command,
  copyLabel,
  copiedLabel,
}: {
  command: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return; // No clipboard permission. The command is selectable anyway.
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative min-w-0 max-w-full rounded-sm border border-accent/40 bg-ground py-3.5 pl-4 pr-12">
      <code className="block min-w-0 overflow-x-auto whitespace-pre font-mono text-[13.5px] text-ink">
        <span aria-hidden="true" className="select-none text-accent">
          ${' '}
        </span>
        {command}
      </code>

      <button
        type="button"
        onClick={copy}
        aria-label={copied ? copiedLabel : copyLabel}
        className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          copied ? 'text-accent' : 'text-faint hover:text-accent'
        }`}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
      </button>

      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </div>
  );
}
