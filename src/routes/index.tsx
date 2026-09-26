import { createFileRoute } from "@tanstack/react-router";
import { Orin } from "@/components/assistant/Orin";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Orin />;
}
