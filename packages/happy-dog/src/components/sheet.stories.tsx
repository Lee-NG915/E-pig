import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./sheet";

const meta = { title: "Components/Sheet", component: Sheet } satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { render: () => <Sheet><SheetTrigger asChild><Button>Open sheet</Button></SheetTrigger><SheetContent><SheetHeader><SheetTitle>Happy Dog</SheetTitle><SheetDescription>A themed sheet component.</SheetDescription></SheetHeader></SheetContent></Sheet> };
