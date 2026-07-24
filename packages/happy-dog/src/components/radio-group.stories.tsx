import type { Meta, StoryObj } from "@storybook/react-vite";
import { RadioGroup, RadioGroupItem } from "./radio-group";

const meta = { title: "Components/RadioGroup", component: RadioGroup } satisfies Meta<typeof RadioGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ error = false, disabled = false }: { error?: boolean; disabled?: boolean }) {
  return (
    <RadioGroup defaultValue="standard" className="gap-3">
      <label className="flex items-center gap-2 text-sm">
        <RadioGroupItem value="standard" aria-invalid={error || undefined} disabled={disabled} /> Standard shipping
      </label>
      <label className="flex items-center gap-2 text-sm">
        <RadioGroupItem value="express" aria-invalid={error || undefined} disabled={disabled} /> Express shipping
      </label>
    </RadioGroup>
  );
}

export const Default: Story = { render: () => <Demo /> };
export const Error: Story = { render: () => <Demo error /> };
export const Disabled: Story = { render: () => <Demo disabled /> };
