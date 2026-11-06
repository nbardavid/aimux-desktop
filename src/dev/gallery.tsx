// Every shadcn primitive in the app's look, for screenshots: `bun run web:dev`, then
// http://localhost:1420/?gallery. Dev only; nothing ships it.

import { CopyIcon, FolderIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxHint,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from '@/components/ui/menu'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// The type scale and the colour tokens (styles.css), to check a token change at a glance.
const TYPE = [
  ['text-2xs', '11 / 14 · badges'],
  ['text-xs', '12 / 16 · ages, hints, labels'],
  ['text-sm', '13 / 18 · chrome'],
  ['text-base', '14 / 22 · bubble, composer, titles'],
  ['text-lg', '20 / 28 · empty states'],
] as const
const SWATCHES = [
  'bg-chrome',
  'bg-bubble',
  'bg-hover',
  'bg-active',
  'bg-border',
  'bg-line-strong',
  'bg-tick',
  'bg-label',
  'bg-faint',
  'bg-good-wash',
  'bg-good',
  'bg-good-ink',
  'bg-critical-wash',
  'bg-critical',
  'bg-critical-ink',
  'bg-warn',
  'bg-warn-ink',
  'bg-merge',
  'bg-tan',
]

const BRANCHES = ['main', 'develop', 'release/0.2', 'feat/dark-mode', 'fix/resume-order']
const GROUPS = [{ items: BRANCHES.slice(0, 2), value: 'Recent' }]

function Row({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-label text-xs font-medium">{label}</h2>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  )
}

export function Gallery() {
  const [wrap, setWrap] = useState(true)
  return (
    <TooltipProvider>
      <main className="bg-background h-full overflow-auto p-8">
        <div className="flex max-w-3xl flex-col gap-6">
          <Row label="Type">
            <div className="flex flex-col gap-1">
              {TYPE.map(([size, use]) => (
                <span key={size} className={size}>
                  {size} — {use}
                </span>
              ))}
              <span className="md">.md — 15 / 24 · Claude’s answers</span>
            </div>
          </Row>
          <Row label="Colours">
            {SWATCHES.map((bg) => (
              <span key={bg} className="text-faint flex flex-col items-center gap-1 text-2xs">
                <span className={`${bg} border-border size-8 rounded-md border`} />
                {bg.slice(3)}
              </span>
            ))}
          </Row>
          <Row label="Button">
            <Button>Create</Button>
            <Button variant="secondary">Deny</Button>
            <Button variant="outline">Later</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">
              Create
              <Kbd className="text-white/60">↩</Kbd>
            </Button>
            <Button className="bg-merge hover:bg-merge-hover h-7 px-2.5 text-white">Merge</Button>
            <Button size="sm" variant="secondary">
              <PlusIcon />
              Small
            </Button>
            <Button size="xs" variant="secondary">
              XS
            </Button>
            <Button aria-label="Add" size="icon" variant="ghost">
              <PlusIcon />
            </Button>
            <Button aria-label="Add" size="icon-sm" variant="ghost">
              <PlusIcon />
            </Button>
          </Row>
          <Row label="Input · Textarea · Kbd">
            <Input className="w-56" placeholder="Search branches" />
            <Input className="w-56" defaultValue="aimux/amber" />
            <Kbd>⌘N</Kbd>
            <Kbd>⇧⌘T</Kbd>
          </Row>
          <Textarea className="w-[460px]" placeholder="What do you want to work on?" />
          <Separator />
          <Row label="Tooltip · Menu · Context menu · Popover · Combobox · Dialog">
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
              <TooltipContent>Review the diff · ⌘G</TooltipContent>
            </Tooltip>
            <Menu>
              <MenuTrigger render={<Button variant="outline" />}>Menu</MenuTrigger>
              <MenuContent>
                <MenuGroup>
                  <MenuLabel>Workspace</MenuLabel>
                  <MenuItem>
                    <FolderIcon />
                    Show in Finder
                    <MenuShortcut>⌥⌘R</MenuShortcut>
                  </MenuItem>
                  <MenuItem>
                    <CopyIcon />
                    Copy path
                    <MenuShortcut>⌘C</MenuShortcut>
                  </MenuItem>
                  <MenuCheckboxItem checked={wrap} onCheckedChange={setWrap}>
                    Wrap lines
                  </MenuCheckboxItem>
                </MenuGroup>
                <MenuSeparator />
                <MenuItem variant="destructive">
                  <Trash2Icon />
                  Delete workspace…
                </MenuItem>
              </MenuContent>
            </Menu>
            <ContextMenu>
              <ContextMenuTrigger className="border-line-strong text-faint flex h-[30px] items-center rounded-lg border border-dashed px-3">
                Right-click here
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem>
                  <PencilIcon />
                  Rename
                </ContextMenuItem>
                <ContextMenuItem>
                  Close
                  <ContextMenuShortcut>⌘W</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive">Close project…</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <Popover>
              <PopoverTrigger render={<Button variant="outline" />}>Popover</PopoverTrigger>
              <PopoverContent>
                <PopoverHeader>
                  <PopoverTitle>Inbox</PopoverTitle>
                  <PopoverDescription>Write the release notes · teal · Done</PopoverDescription>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
            <Combobox defaultValue="main" items={BRANCHES}>
              <ComboboxTrigger>
                <ComboboxValue />
              </ComboboxTrigger>
              <ComboboxContent>
                <ComboboxSearch placeholder="Search branches" />
                <ComboboxEmpty>No branch matches.</ComboboxEmpty>
                <ComboboxList>
                  {(branch: string) => (
                    <ComboboxItem key={branch} value={branch}>
                      {branch}
                      {branch === 'main' && <ComboboxHint>default</ComboboxHint>}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <Combobox items={GROUPS}>
              <ComboboxTrigger>Grouped</ComboboxTrigger>
              <ComboboxContent>
                <ComboboxSearch placeholder="Search" />
                <ComboboxList>
                  {(group: { value: string; items: string[] }) => (
                    <ComboboxGroup key={group.value} items={group.items}>
                      <ComboboxLabel>{group.value}</ComboboxLabel>
                      {group.items.map((b) => (
                        <ComboboxItem key={b} value={b}>
                          {b}
                        </ComboboxItem>
                      ))}
                    </ComboboxGroup>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <Dialog>
              <DialogTrigger render={<Button />}>Dialog</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New workspace</DialogTitle>
                  <DialogDescription>The composer is the app’s one dialog.</DialogDescription>
                </DialogHeader>
                <div className="px-4 py-3">
                  <Textarea placeholder="What do you want to work on?" />
                </div>
                <DialogFooter>
                  <Button>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Row>
        </div>
      </main>
    </TooltipProvider>
  )
}
