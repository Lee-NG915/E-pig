import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./select";

const meta = { title: "Components/Select", component: Select } satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ size, disabled }: { size?: "sm" | "md"; disabled?: boolean }) {
  return (
    <div className="w-72">
      <Select disabled={disabled}>
        <SelectTrigger size={size}>
          <SelectValue placeholder="Select fabric" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fabric</SelectLabel>
            <SelectItem value="linen">Linen — Oat</SelectItem>
            <SelectItem value="boucle">Bouclé — Cream</SelectItem>
            <SelectItem value="velvet" disabled>
              Velvet — Moss (sold out)
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
export const Small: Story = { render: () => <Demo size="sm" /> };
export const Disabled: Story = { render: () => <Demo disabled /> };
