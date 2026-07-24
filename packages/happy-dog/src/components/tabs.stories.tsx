import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = { title: "Components/Tabs", component: Tabs } satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ variant }: { variant: "underline" | "segmented" }) {
  return (
    <Tabs defaultValue="details" className="w-96">
      <TabsList variant={variant}>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
        <TabsTrigger value="care" disabled>
          Care
        </TabsTrigger>
      </TabsList>
      <TabsContent value="details">Product details content.</TabsContent>
      <TabsContent value="dimensions">Dimensions content.</TabsContent>
    </Tabs>
  );
}

export const Underline: Story = { render: () => <Demo variant="underline" /> };
export const Segmented: Story = { render: () => <Demo variant="segmented" /> };
