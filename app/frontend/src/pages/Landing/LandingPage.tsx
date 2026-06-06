import { Link } from "react-router-dom";
import { Bot, Shield, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { paths } from "@/routes/paths";

const features = [
  {
    icon: Bot,
    title: "Natural language workflows",
    description:
      "Manage Canvas courses, assignments, and communications through conversational AI.",
  },
  {
    icon: Shield,
    title: "Role-based security",
    description:
      "Purpose-built experiences for instructors, teaching assistants, and administrators.",
  },
  {
    icon: Sparkles,
    title: "Canvas-native assistance",
    description:
      "Streamline repetitive tasks while keeping humans in control of every action.",
  },
];

export function LandingPage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-12 md:px-6 md:py-20">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Canvas Workflow Assistant
        </h1>
        <p className="text-lg text-muted-foreground md:text-xl">
          A secure AI-powered assistant that helps instructors, TAs, and
          administrators manage Canvas workflows through natural language.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" render={<Link to={paths.register} />}>
            Create account
          </Button>
          <Button
            size="lg"
            variant="outline"
            render={<Link to={paths.instructor.dashboard} />}
          >
            View instructor demo
          </Button>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" />
              </div>
              <CardTitle className="text-lg">{feature.title}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </section>
  );
}
