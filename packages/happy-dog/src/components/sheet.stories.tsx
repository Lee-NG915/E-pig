import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./sheet";

const meta = { title: "Components/Sheet", component: Sheet } satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;

function SheetDemo({ side }: { side: "right" | "bottom" }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open {side} sheet</Button>
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Happy Dog</SheetTitle>
          <SheetDescription>A themed sheet component ({side}).</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}

/** Desktop drawer — slides in from the right edge. */
export const Right: Story = { render: () => <SheetDemo side="right" /> };

/** Mobile cart drawer — slides up from the bottom, 16px top radius. */
export const Bottom: Story = { render: () => <SheetDemo side="bottom" /> };
