import { AlertCircle, Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { DataTableToolbar } from "@/components/common/DataTableToolbar";
import { TablePagination } from "@/components/common/TablePagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useInstructorCourseOutletContext } from "@/hooks/useInstructorCourseOutletContext";
import { useResolvedInstructorCourse } from "@/hooks/useResolvedInstructorCourse";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import { pageEmbedded, pageShell } from "@/lib/page-shell";
import {
  DEFAULT_PAGE_SIZE,
  filterBySearch,
  paginateItems,
} from "@/lib/table-pagination";
import {
  paths,
  type AiActionDraftLocationState,
} from "@/routes/paths";
import {
  QuizApiError,
  fetchCourseQuizzes,
  setQuizPublished,
} from "@/services/quizzes";
import { fetchQuizCapabilities } from "@/services/quizCreator";
import type { Quiz } from "@/types/quiz";
import type { InstructorCourse } from "@/types/course";

export function InstructorCourseQuizzesPage() {
  const { localCourseId } = useParams();
  const layoutContext = useInstructorCourseOutletContext();
  const embedded = layoutContext?.embedded ?? false;
  const { accessToken, user } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [newQuizzesNotice, setNewQuizzesNotice] = useState<string | null>(null);
  const [togglingPublishQuizKey, setTogglingPublishQuizKey] = useState<
    string | null
  >(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const parsedLocalCourseId = layoutContext?.localCourseId ?? Number(localCourseId);
  const idIsValid =
    Number.isInteger(parsedLocalCourseId) && parsedLocalCourseId > 0;

  const resolvedCourse = useResolvedInstructorCourse(
    embedded ? 0 : parsedLocalCourseId,
  );
  const {
    course,
    canvasUrl,
    isLoading: isResolvingCourse,
    loadError: courseError,
    needsCanvasConnection,
  } = embedded && layoutContext
    ? {
        course: layoutContext.course,
        canvasUrl: layoutContext.canvasUrl,
        isLoading: false,
        loadError: layoutContext.loadError,
        needsCanvasConnection: layoutContext.needsCanvasConnection,
      }
    : resolvedCourse;

  useEffect(() => {
    if (
      !accessToken ||
      !idIsValid ||
      !user?.has_canvas_token ||
      isResolvingCourse ||
      !course ||
      !canvasUrl
    ) {
      return;
    }

    const token = accessToken;
    const selectedCanvasUrl = canvasUrl;
    let cancelled = false;

    async function loadQuizzes() {
      try {
        const [data, capabilities] = await Promise.all([
          fetchCourseQuizzes(parsedLocalCourseId, token, selectedCanvasUrl),
          fetchQuizCapabilities(parsedLocalCourseId, {
            accessToken: token,
            canvasUrl: selectedCanvasUrl,
          }).catch(() => null),
        ]);
        if (!cancelled) {
          setQuizzes(data);
          setLoadError(null);
          // Ticket 13 review: if New Quizzes is unavailable/failing, classic
          // quizzes still load — surface that so rows aren't silently missing.
          if (capabilities && !capabilities.newQuizzes) {
            setNewQuizzesNotice(
              capabilities.newQuizzesUnavailableReason?.trim() ||
                "New Quizzes could not be loaded for this course. Classic quizzes are still shown.",
            );
          } else {
            setNewQuizzesNotice(null);
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof QuizApiError
              ? error.message
              : "Unable to load quizzes.";
          setLoadError(message);
          setQuizzes([]);
          setNewQuizzesNotice(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data load
    setIsLoading(true);
    void loadQuizzes();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    canvasUrl,
    course,
    idIsValid,
    isResolvingCourse,
    parsedLocalCourseId,
    user?.has_canvas_token,
  ]);

  const filteredQuizzes = useMemo(
    () =>
      filterBySearch(quizzes, search, (quiz) =>
        [quiz.title, String(quiz.id), quiz.quiz_engine].join(" "),
      ),
    [quizzes, search],
  );

  const paginated = useMemo(
    () => paginateItems(filteredQuizzes, page, pageSize),
    [filteredQuizzes, page, pageSize],
  );

  const handleTogglePublish = async (quiz: Quiz, published: boolean) => {
    if (!accessToken || !canvasUrl) {
      return;
    }

    setPublishError(null);
    setTogglingPublishQuizKey(`${quiz.quiz_engine}-${quiz.id}`);
    try {
      const updated = await setQuizPublished(
        parsedLocalCourseId,
        quiz.id,
        published,
        accessToken,
        {
          canvasUrl,
          quizEngine: quiz.quiz_engine,
        },
      );
      setQuizzes((current) =>
        current.map((item) =>
          item.id === quiz.id && item.quiz_engine === quiz.quiz_engine
            ? { ...item, ...updated }
            : item,
        ),
      );
    } catch (error) {
      setPublishError(
        error instanceof QuizApiError
          ? error.message
          : "Unable to update quiz publish status. Please try again.",
      );
    } finally {
      setTogglingPublishQuizKey(null);
    }
  };

  if (!idIsValid) {
    return (
      <PageState
        embedded={embedded}
        title="Invalid course link"
        message="The course ID in this URL is not valid."
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  if (!embedded && (!user?.has_canvas_token || needsCanvasConnection)) {
    return (
      <div className={pageShell}>
        <PageHeader localCourseId={parsedLocalCourseId} course={course} embedded={embedded} />
        <CanvasConnectionRequired />
      </div>
    );
  }

  if (!embedded && (isResolvingCourse || isLoading)) {
    return (
      <PageState
        embedded={embedded}
        title="Loading quizzes"
        message="Fetching quizzes from Canvas..."
        icon={<Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />}
      />
    );
  }

  if (!embedded && courseError) {
    return (
      <PageState
        embedded={embedded}
        title="Unable to load course"
        message={courseError}
        icon={<AlertCircle className="size-5 text-destructive" aria-hidden="true" />}
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  if (!embedded && !course) {
    return (
      <PageState
        embedded={embedded}
        title="Course not found"
        message="This course is not available in your synced Canvas courses."
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  if (embedded && isLoading) {
    return (
      <PageState
        embedded
        title="Loading quizzes"
        message="Fetching quizzes from Canvas..."
        icon={<Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />}
      />
    );
  }

  if (loadError) {
    return (
      <PageState
        embedded={embedded}
        title="Unable to load quizzes"
        message={loadError}
        icon={<AlertCircle className="size-5 text-destructive" aria-hidden="true" />}
        action={
          embedded ? undefined : (
            <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
              Back to courses
            </Button>
          )
        }
      />
    );
  }

  const content = (
    <>
      <PageHeader localCourseId={parsedLocalCourseId} course={course} embedded={embedded} />

      <DataTableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Search quizzes"
        searchPlaceholder="Search by title, ID, or engine..."
      />

      {publishError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{publishError}</p>
        </div>
      ) : null}

      {newQuizzesNotice ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{newQuizzesNotice}</p>
        </div>
      ) : null}

      {quizzes.length === 0 ? (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No quizzes found for this course in Canvas.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
          <CardContent className="p-0">
            {paginated.totalItems === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No quizzes match your search.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quiz</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.items.map((quiz) => {
                      const isPublished = quiz.published;
                      const isTogglingPublish =
                        togglingPublishQuizKey ===
                        `${quiz.quiz_engine}-${quiz.id}`;
                      return (
                        <TableRow key={`${quiz.quiz_engine}-${quiz.id}`}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">
                                {quiz.title}
                                {!isPublished ? (
                                  <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                                    Unpublished
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {quiz.quiz_engine === "new_quizzes"
                                  ? "New Quizzes"
                                  : "Classic"}{" "}
                                · ID: {quiz.id}
                                {quiz.assignment_id != null &&
                                quiz.assignment_id !== quiz.id
                                  ? ` · Gradebook assignment: ${quiz.assignment_id}`
                                  : null}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {formatDueDateForDisplay(quiz.due_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isTogglingPublish}
                              aria-busy={isTogglingPublish}
                              onClick={() =>
                                void handleTogglePublish(quiz, !isPublished)
                              }
                            >
                              {isTogglingPublish ? (
                                <Loader2
                                  data-icon="inline-start"
                                  className="animate-spin"
                                />
                              ) : null}
                              {isPublished ? "Unpublish" : "Publish"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <TablePagination
                  page={paginated.page}
                  totalPages={paginated.totalPages}
                  totalItems={paginated.totalItems}
                  pageSize={paginated.pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(value) => {
                    setPageSize(value);
                    setPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );

  return embedded ? (
    <div className={pageEmbedded}>{content}</div>
  ) : (
    <div className={pageShell}>{content}</div>
  );
}

function PageHeader({
  localCourseId,
  course,
  embedded = false,
}: {
  localCourseId: number;
  course?: InstructorCourse | null;
  embedded?: boolean;
}) {
  const createQuizButton = (
    <Button
      size={embedded ? "sm" : "default"}
      render={
        <Link
          to={paths.instructor.quizCreate}
          state={
            {
              aiQuizDraft: {
                courseId: localCourseId,
              },
            } satisfies AiActionDraftLocationState
          }
        />
      }
    >
      <Plus data-icon="inline-start" />
      Create quiz
    </Button>
  );

  if (embedded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Quizzes</h2>
        {createQuizButton}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Course Quizzes
        </h1>
        <p className="text-muted-foreground">
          {course
            ? formatInstructorCourseTitle(course)
            : "Manage classic and New Quizzes for this course."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {createQuizButton}
        <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
          Back to courses
        </Button>
      </div>
    </div>
  );
}

function PageState({
  title,
  message,
  icon,
  action,
  embedded = false,
}: {
  title: string;
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
  embedded?: boolean;
}) {
  const card = (
    <Card className="max-w-2xl shadow-sm ring-1 ring-border/60">
      <CardContent className="flex flex-col items-start gap-4 p-6">
        <div className="flex items-center gap-3">
          {icon}
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        {action}
      </CardContent>
    </Card>
  );

  if (embedded) {
    return card;
  }

  return <div className={pageShell}>{card}</div>;
}
