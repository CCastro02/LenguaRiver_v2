import { notFound } from "next/navigation";
import { lessons } from "@/lib/lesson-data";
import { LessonRunner } from "../LessonRunner";

type PageProps = { params: Promise<{ id: string }> };

export default async function LessonByIdPage({ params }: PageProps) {
  const { id } = await params;
  if (!lessons.some((lesson) => lesson.id === id)) {
    notFound();
  }
  return <LessonRunner key={id} lessonId={id} />;
}
