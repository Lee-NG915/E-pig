import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

const meta = { title: "Components/Card", component: Card } satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ variant, interactive }: { variant?: "surface" | "outline"; interactive?: boolean }) {
  return (
    <Card variant={variant} interactive={interactive} className="w-80" tabIndex={interactive ? 0 : undefined}>
      <CardHeader>
        <CardTitle>Calm Modular Sofa</CardTitle>
        <CardDescription>Surface · outline · interactive variants</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">Cards default to no shadow; elevation appears only on interaction.</CardContent>
      <CardFooter>
        <Button size="sm">View</Button>
      </CardFooter>
    </Card>
  );
}

export const Surface: Story = { render: () => <Demo variant="surface" /> };
export const Outline: Story = { render: () => <Demo variant="outline" /> };
export const Interactive: Story = { render: () => <Demo variant="outline" interactive /> };
