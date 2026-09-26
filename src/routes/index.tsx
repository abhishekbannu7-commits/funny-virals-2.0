import { createFileRoute } from "@tanstack/react-router";
import { Zoro } from "@/components/assistant/Zoro";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Zoro />;
}
