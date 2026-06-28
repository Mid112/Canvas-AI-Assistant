import type { InstitutionSubmissionsData } from "@/types/submission";

export const institutionSubmissionsData: InstitutionSubmissionsData[] = [
  {
    institutionId: "ubc",
    assignments: [
      {
        id: "pa3",
        courseId: 1,
        label: "Programming Assignment 3",
        courseCode: "CS 101",
        submissionRate: 88,
        missingSubmissions: [
          {
            id: "ubc-m1",
            name: "Alex Thompson",
            email: "alex.thompson@student.ubc.ca",
            avatarColor: "bg-sky-500",
            lastActive: "3 days ago",
          },
          {
            id: "ubc-m2",
            name: "Maria Garcia",
            email: "maria.garcia@student.ubc.ca",
            avatarColor: "bg-violet-500",
            lastActive: "1 week ago",
          },
          {
            id: "ubc-m3",
            name: "David Kim",
            email: "david.kim@student.ubc.ca",
            avatarColor: "bg-emerald-500",
            lastActive: "2 days ago",
          },
          {
            id: "ubc-m4",
            name: "Sophie Chen",
            email: "sophie.chen@student.ubc.ca",
            avatarColor: "bg-rose-500",
            lastActive: "5 days ago",
          },
          {
            id: "ubc-m5",
            name: "James Wilson",
            email: "james.wilson@student.ubc.ca",
            avatarColor: "bg-amber-500",
            lastActive: "4 days ago",
          },
        ],
        lateSubmissions: [
          {
            id: "ubc-l1",
            name: "Emma Davis",
            email: "emma.davis@student.ubc.ca",
            avatarColor: "bg-indigo-500",
            lateBy: "2 days late",
          },
          {
            id: "ubc-l2",
            name: "Ryan Martinez",
            email: "ryan.martinez@student.ubc.ca",
            avatarColor: "bg-teal-500",
            lateBy: "1 day late",
          },
          {
            id: "ubc-l3",
            name: "Olivia Brown",
            email: "olivia.brown@student.ubc.ca",
            avatarColor: "bg-fuchsia-500",
            lateBy: "3 days late",
          },
        ],
        aiSummary: {
          keyInsights:
            "Programming Assignment 3 has a submission rate of 88%. Five students have not submitted, and three submitted after the deadline.",
          recommendation:
            "Send a reminder to students who haven't submitted. Focus on Maria Garcia and Sophie Chen, who haven't been active recently.",
          lateSubmissionsNote:
            "Late submissions average a score of 85%. Consider a short grace-period policy for first-time late work.",
        },
      },
      {
        id: "hw4",
        courseId: 2,
        label: "Homework 4: Recursion",
        courseCode: "CS 201",
        submissionRate: 92,
        missingSubmissions: [
          {
            id: "ubc-m6",
            name: "Noah Patel",
            email: "noah.patel@student.ubc.ca",
            avatarColor: "bg-blue-500",
            lastActive: "1 day ago",
          },
          {
            id: "ubc-m7",
            name: "Liam O'Connor",
            email: "liam.oconnor@student.ubc.ca",
            avatarColor: "bg-orange-500",
            lastActive: "6 days ago",
          },
        ],
        lateSubmissions: [
          {
            id: "ubc-l4",
            name: "Ava Singh",
            email: "ava.singh@student.ubc.ca",
            avatarColor: "bg-pink-500",
            lateBy: "1 day late",
          },
        ],
        aiSummary: {
          keyInsights:
            "Homework 4: Recursion has a submission rate of 92%. Two students are still missing submissions.",
          recommendation:
            "Reach out to Liam O'Connor, who has been inactive for nearly a week.",
          lateSubmissionsNote:
            "Only one late submission so far. Scores remain within the class average.",
        },
      },
      {
        id: "midterm",
        courseId: 3,
        label: "Midterm Project",
        courseCode: "CS 301",
        submissionRate: 76,
        missingSubmissions: [
          {
            id: "ubc-m8",
            name: "Ethan Wright",
            email: "ethan.wright@student.ubc.ca",
            avatarColor: "bg-cyan-500",
            lastActive: "2 days ago",
          },
          {
            id: "ubc-m9",
            name: "Isabella Rossi",
            email: "isabella.rossi@student.ubc.ca",
            avatarColor: "bg-lime-600",
            lastActive: "3 days ago",
          },
          {
            id: "ubc-m10",
            name: "Mason Lee",
            email: "mason.lee@student.ubc.ca",
            avatarColor: "bg-red-500",
            lastActive: "1 week ago",
          },
        ],
        lateSubmissions: [
          {
            id: "ubc-l5",
            name: "Charlotte Nguyen",
            email: "charlotte.nguyen@student.ubc.ca",
            avatarColor: "bg-purple-500",
            lateBy: "4 days late",
          },
          {
            id: "ubc-l6",
            name: "Benjamin Hall",
            email: "benjamin.hall@student.ubc.ca",
            avatarColor: "bg-yellow-600",
            lateBy: "2 days late",
          },
        ],
        aiSummary: {
          keyInsights:
            "Midterm Project has a submission rate of 76%, below the course average. Three students have not submitted.",
          recommendation:
            "Schedule office hours for students who missed the deadline. Mason Lee may need additional support.",
          lateSubmissionsNote:
            "Late project submissions are scoring 12% lower on average than on-time work.",
        },
      },
      {
        id: "research-paper",
        courseId: 4,
        label: "Research Paper Draft",
        courseCode: "CS 401",
        submissionRate: 81,
        missingSubmissions: [
          {
            id: "ubc-m11",
            name: "Olivia Martinez",
            email: "olivia.martinez@student.ubc.ca",
            avatarColor: "bg-indigo-500",
            lastActive: "2 days ago",
          },
        ],
        lateSubmissions: [
          {
            id: "ubc-l7",
            name: "Henry Clark",
            email: "henry.clark@student.ubc.ca",
            avatarColor: "bg-teal-500",
            lateBy: "2 days late",
          },
        ],
        aiSummary: {
          keyInsights:
            "Research Paper Draft has a submission rate of 81%. One student has not submitted.",
          recommendation:
            "Check in with Olivia Martinez before the peer review session.",
          lateSubmissionsNote:
            "One late draft was submitted with a valid extension.",
        },
      },
      {
        id: "portfolio",
        courseId: 5,
        label: "Portfolio Milestone 2",
        courseCode: "CS 150",
        submissionRate: 90,
        missingSubmissions: [
          {
            id: "ubc-m12",
            name: "Grace Turner",
            email: "grace.turner@student.ubc.ca",
            avatarColor: "bg-fuchsia-500",
            lastActive: "1 day ago",
          },
          {
            id: "ubc-m13",
            name: "Ryan Cooper",
            email: "ryan.cooper@student.ubc.ca",
            avatarColor: "bg-slate-500",
            lastActive: "4 days ago",
          },
        ],
        lateSubmissions: [],
        aiSummary: {
          keyInsights:
            "Portfolio Milestone 2 has a submission rate of 90%. Two students have not submitted.",
          recommendation:
            "Send a reminder before the demo day. Ryan Cooper has been inactive recently.",
          lateSubmissionsNote: "No late submissions for this milestone.",
        },
      },
      {
        id: "sql-project",
        courseId: 6,
        label: "SQL Schema Project",
        courseCode: "CS 250",
        submissionRate: 86,
        missingSubmissions: [
          {
            id: "ubc-m14",
            name: "Nina Shah",
            email: "nina.shah@student.ubc.ca",
            avatarColor: "bg-amber-500",
            lastActive: "3 days ago",
          },
        ],
        lateSubmissions: [
          {
            id: "ubc-l8",
            name: "Tyler Brooks",
            email: "tyler.brooks@student.ubc.ca",
            avatarColor: "bg-green-600",
            lateBy: "1 day late",
          },
        ],
        aiSummary: {
          keyInsights:
            "SQL Schema Project has a submission rate of 86%. One student has not submitted.",
          recommendation:
            "Offer a schema review session for students still working on normalization.",
          lateSubmissionsNote:
            "Late submissions are trending close to the class average.",
        },
      },
    ],
  },
  {
    institutionId: "ubco",
    assignments: [
      {
        id: "lab2",
        courseId: 101,
        label: "Lab 2: Control Flow",
        courseCode: "COSC 111",
        submissionRate: 84,
        missingSubmissions: [
          {
            id: "ubco-m1",
            name: "Jordan Taylor",
            email: "jordan.taylor@student.ubco.ca",
            avatarColor: "bg-sky-500",
            lastActive: "2 days ago",
          },
          {
            id: "ubco-m2",
            name: "Taylor Brooks",
            email: "taylor.brooks@student.ubco.ca",
            avatarColor: "bg-violet-500",
            lastActive: "4 days ago",
          },
        ],
        lateSubmissions: [
          {
            id: "ubco-l1",
            name: "Casey Morgan",
            email: "casey.morgan@student.ubco.ca",
            avatarColor: "bg-emerald-500",
            lateBy: "1 day late",
          },
        ],
        aiSummary: {
          keyInsights:
            "Lab 2: Control Flow has a submission rate of 84%. Two students have not submitted.",
          recommendation:
            "Send a reminder before the weekend. Taylor Brooks has been inactive for several days.",
          lateSubmissionsNote:
            "One late submission received full credit after manual review.",
        },
      },
      {
        id: "quiz1",
        courseId: 102,
        label: "Quiz 1: Machine Architecture",
        courseCode: "COSC 211",
        submissionRate: 91,
        missingSubmissions: [
          {
            id: "ubco-m3",
            name: "Riley Adams",
            email: "riley.adams@student.ubco.ca",
            avatarColor: "bg-rose-500",
            lastActive: "1 day ago",
          },
        ],
        lateSubmissions: [],
        aiSummary: {
          keyInsights:
            "Quiz 1: Machine Architecture has a submission rate of 91%. One student has not submitted.",
          recommendation:
            "Follow up with Riley Adams before the next in-class session.",
          lateSubmissionsNote: "No late submissions for this assignment.",
        },
      },
      {
        id: "db-lab1",
        courseId: 103,
        label: "Lab 1: ER Diagrams",
        courseCode: "COSC 304",
        submissionRate: 88,
        missingSubmissions: [
          {
            id: "ubco-m4",
            name: "Sam Rivera",
            email: "sam.rivera@student.ubco.ca",
            avatarColor: "bg-cyan-500",
            lastActive: "2 days ago",
          },
        ],
        lateSubmissions: [
          {
            id: "ubco-l2",
            name: "Jamie Lee",
            email: "jamie.lee@student.ubco.ca",
            avatarColor: "bg-orange-500",
            lateBy: "3 days late",
          },
        ],
        aiSummary: {
          keyInsights:
            "Lab 1: ER Diagrams has a submission rate of 88%. One student has not submitted.",
          recommendation:
            "Share the ER diagram rubric again before the next lab.",
          lateSubmissionsNote:
            "One late lab submission is pending manual review.",
        },
      },
    ],
  },
];

export function getInstitutionSubmissionsData(
  institutionId: string,
): InstitutionSubmissionsData | undefined {
  return institutionSubmissionsData.find(
    (entry) => entry.institutionId === institutionId,
  );
}
