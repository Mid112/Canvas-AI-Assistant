// Instructor page note: coordinates quiz question card UI state with Canvas-backed services and active-course context.

import { useWatch, type Control, type UseFormRegister, type UseFormSetValue } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { QuizReviewFormInput } from "./quizCreateSchema";

/** Question types that carry answer options. Short-answer and essay items are
 * instructor-scored and have none, so the answer block is omitted entirely. */
const CHOICE_TYPES = new Set(["multiple_choice_question", "true_false_question"]);

interface QuizQuestionCardProps {
  index: number;
  register: UseFormRegister<QuizReviewFormInput>;
  control: Control<QuizReviewFormInput>;
  setValue: UseFormSetValue<QuizReviewFormInput>;
}

/** One question in the review step.
 *
 * Answers used to be invisible here: the card rendered question text, a hidden
 * question type, and points, while the generated answer options and the correct
 * one rode along in form state straight to Canvas. Instructors were approving
 * content they had never seen — the same problem as showing a raw assignment id
 * on a preview, and worse, because a wrong correct-answer is only discoverable
 * after students have taken the quiz.
 *
 * Canvas encodes correctness as a weight of 100 on exactly one answer and 0 on
 * the rest (see _check_choice_answers in services/quiz_validation.py, mirrored
 * in quizCreateSchema). A radio group expresses that invariant directly, so it
 * cannot be violated from the UI rather than merely being rejected afterwards.
 */
export function QuizQuestionCard({
  index,
  register,
  control,
  setValue,
}: QuizQuestionCardProps) {
  const questionType = useWatch({ control, name: `questions.${index}.questionType` });
  const answers = useWatch({ control, name: `questions.${index}.answers` });
  const answerList = Array.isArray(answers) ? answers : [];
  const showAnswers = CHOICE_TYPES.has(String(questionType)) && answerList.length > 0;

  const markCorrect = (correctIndex: number) => {
    answerList.forEach((_, answerIndex) => {
      setValue(
        `questions.${index}.answers.${answerIndex}.weight`,
        answerIndex === correctIndex ? 100 : 0,
        { shouldValidate: true, shouldDirty: true },
      );
    });
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/70 p-3">
      <Label htmlFor={`quiz-question-${index}`}>Question {index + 1}</Label>
      <Textarea id={`quiz-question-${index}`} rows={3} {...register(`questions.${index}.questionText`)} />
      <input type="hidden" {...register(`questions.${index}.questionType`)} />
      {/* Visible Points label (#1506) — aria-label alone made scoring easy to miss. */}
      <div className="space-y-1.5">
        <Label htmlFor={`quiz-question-${index}-points`}>Points</Label>
        <Input
          id={`quiz-question-${index}-points`}
          type="number"
          min="0"
          // See the note on the quiz total: a fixed step would make the browser
          // reject generated values like 16.67 before validation can run.
          step="any"
          aria-label={`Points for question ${index + 1}`}
          {...register(`questions.${index}.pointsPossible`, { valueAsNumber: true })}
        />
      </div>

      {showAnswers ? (
        <fieldset className="space-y-2 pt-1">
          <legend className="text-sm font-medium">
            Answers
            <span className="ml-1 font-normal text-muted-foreground">
              (select the correct one)
            </span>
          </legend>
          {answerList.map((answer, answerIndex) => {
            const isCorrect = Number(answer?.weight) === 100;
            return (
              <div key={answerIndex} className="flex items-center gap-2">
                <input
                  type="radio"
                  className="size-4 shrink-0 accent-primary"
                  name={`question-${index}-correct`}
                  aria-label={`Mark answer ${answerIndex + 1} of question ${index + 1} as correct`}
                  checked={isCorrect}
                  onChange={() => markCorrect(answerIndex)}
                />
                <Input
                  aria-label={`Answer ${answerIndex + 1} of question ${index + 1}`}
                  {...register(`questions.${index}.answers.${answerIndex}.text`)}
                />
                {isCorrect ? (
                  <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800">
                    Correct
                  </span>
                ) : null}
                {/* Weight is driven by the radio above, never typed directly —
                    it must stay exactly 0 or 100 for Canvas. */}
                <input
                  type="hidden"
                  {...register(`questions.${index}.answers.${answerIndex}.weight`, {
                    valueAsNumber: true,
                  })}
                />
              </div>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}
