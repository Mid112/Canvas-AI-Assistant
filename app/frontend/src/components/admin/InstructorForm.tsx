import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  editInstructorFormSchema,
  instructorFormSchema,
  type EditInstructorFormValues,
  type InstructorFormValues,
} from "@/schemas/instructorSchema";

type InstructorFormBaseProps = {
  serverError?: string | null;
  isSubmitting?: boolean;
  onCancel: () => void;
};

type CreateInstructorFormProps = InstructorFormBaseProps & {
  mode: "create";
  defaultValues?: Partial<InstructorFormValues>;
  onSubmit: (values: InstructorFormValues) => void;
};

type EditInstructorFormProps = InstructorFormBaseProps & {
  mode: "edit";
  defaultValues?: Partial<EditInstructorFormValues>;
  onSubmit: (values: EditInstructorFormValues) => void;
};

type InstructorFormProps = CreateInstructorFormProps | EditInstructorFormProps;

export function InstructorForm(props: InstructorFormProps) {
  const {
    mode,
    defaultValues,
    serverError = null,
    isSubmitting = false,
    onCancel,
    onSubmit,
  } = props;
  const isCreate = mode === "create";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InstructorFormValues | EditInstructorFormValues>({
    resolver: zodResolver(isCreate ? instructorFormSchema : editInstructorFormSchema),
    defaultValues: {
      firstName: defaultValues?.firstName ?? "",
      lastName: defaultValues?.lastName ?? "",
      email: defaultValues?.email ?? "",
      temporaryPassword: "",
    },
    mode: "onBlur",
  });

  const handleFormSubmit = (values: InstructorFormValues | EditInstructorFormValues) => {
    if (isCreate) {
      (onSubmit as CreateInstructorFormProps["onSubmit"])(values as InstructorFormValues);
      return;
    }

    (onSubmit as EditInstructorFormProps["onSubmit"])(values as EditInstructorFormValues);
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={handleSubmit(handleFormSubmit)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="instructor-first-name">First Name</Label>
          <Input
            id="instructor-first-name"
            aria-invalid={Boolean(errors.firstName)}
            aria-describedby={errors.firstName ? "instructor-first-name-error" : undefined}
            {...register("firstName")}
          />
          {errors.firstName ? (
            <p
              id="instructor-first-name-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.firstName.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="instructor-last-name">Last Name</Label>
          <Input
            id="instructor-last-name"
            aria-invalid={Boolean(errors.lastName)}
            aria-describedby={errors.lastName ? "instructor-last-name-error" : undefined}
            {...register("lastName")}
          />
          {errors.lastName ? (
            <p
              id="instructor-last-name-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.lastName.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructor-email">Email Address</Label>
        <Input
          id="instructor-email"
          type="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "instructor-email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id="instructor-email-error" role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      {isCreate ? (
        <div className="space-y-2">
          <Label htmlFor="instructor-temporary-password">Temporary Password</Label>
          <Input
            id="instructor-temporary-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean("temporaryPassword" in errors && errors.temporaryPassword)}
            aria-describedby={
              "temporaryPassword" in errors && errors.temporaryPassword
                ? "instructor-temporary-password-error"
                : undefined
            }
            {...register("temporaryPassword")}
          />
          {"temporaryPassword" in errors && errors.temporaryPassword ? (
            <p
              id="instructor-temporary-password-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.temporaryPassword.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {serverError ? (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : isCreate
              ? "Create instructor"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
