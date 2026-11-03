import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@e-pig/happy-dog/components/button";

import { mainNav } from "@/modules/content/lib/main-nav";

import { MobileNav } from "./mobile-nav";

function NavigationExample(args: ComponentProps<typeof MobileNav>) {
  const [open, setOpen] = useState(args.open);
  const [drill, setDrill] = useState(args.drill);
  return (
    <>
      <Button className="m-6" onClick={() => setOpen(true)}>Open menu</Button>
      <MobileNav
        {...args}
        open={open}
        drill={drill}
        onDrill={setDrill}
        onClose={() => { setOpen(false); setDrill(null); }}
      />
    </>
  );
}

const meta = {
  title: "Modules/content/MobileNav",
  component: MobileNav,
  parameters: { layout: "fullscreen" },
  args: { open: true, marketId: "au", drill: null, onClose: () => {}, onDrill: () => {} },
  render: (args) => <NavigationExample {...args} />,
} satisfies Meta<typeof MobileNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const LivingRoom: Story = { args: { drill: mainNav[0] } };
export const Singapore: Story = { args: { marketId: "sg" } };
export const Closed: Story = { args: { open: false } };
