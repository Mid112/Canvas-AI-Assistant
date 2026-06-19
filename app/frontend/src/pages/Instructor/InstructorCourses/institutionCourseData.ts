import type { InstitutionCourseData } from "@/types/course";
import type { Institution } from "@/types/institution";

export const institutions: Institution[] = [
  {
    id: "ubc",
    name: "University of British Columbia",
    shortName: "UBC",
  },
  {
    id: "ubco",
    name: "UBC Okanagan",
    shortName: "UBCO",
  },
];

export const institutionCourseData: InstitutionCourseData[] = [
  {
    institutionId: "ubc",
    analytics: {
      averagePerformance: 78,
      averagePerformanceTrend: 5,
      activeStudents: 142,
      totalStudents: 156,
      completedAssignments: 89,
      completedAssignmentsTrend: 3,
      atRiskStudents: 8,
      atRiskStudentsTrend: -2,
    },
    courses: [
      {
        id: 1,
        code: "CS 101",
        name: "Introduction to Programming",
        progress: 82,
        studentCount: 45,
        assignmentCount: 8,
        lastActivity: "2 hours ago",
      },
      {
        id: 2,
        code: "CS 201",
        name: "Data Structures",
        progress: 76,
        studentCount: 38,
        assignmentCount: 6,
        lastActivity: "5 hours ago",
      },
      {
        id: 3,
        code: "CS 301",
        name: "Algorithms",
        progress: 88,
        studentCount: 42,
        assignmentCount: 5,
        lastActivity: "1 day ago",
      },
      {
        id: 4,
        code: "CS 401",
        name: "Advanced Topics in Computer Science",
        progress: 79,
        studentCount: 31,
        assignmentCount: 4,
        lastActivity: "6 hours ago",
      },
      {
        id: 5,
        code: "CS 150",
        name: "Web Development",
        progress: 85,
        studentCount: 52,
        assignmentCount: 10,
        lastActivity: "30 minutes ago",
      },
      {
        id: 6,
        code: "CS 250",
        name: "Database Systems",
        progress: 74,
        studentCount: 40,
        assignmentCount: 7,
        lastActivity: "3 days ago",
      },
    ],
  },
  {
    institutionId: "ubco",
    analytics: {
      averagePerformance: 72,
      averagePerformanceTrend: 2,
      activeStudents: 96,
      totalStudents: 108,
      completedAssignments: 84,
      completedAssignmentsTrend: 1,
      atRiskStudents: 5,
      atRiskStudentsTrend: -1,
    },
    courses: [
      {
        id: 101,
        code: "COSC 111",
        name: "Computer Programming I",
        progress: 80,
        studentCount: 58,
        assignmentCount: 7,
        lastActivity: "1 hour ago",
      },
      {
        id: 102,
        code: "COSC 211",
        name: "Machine Architecture",
        progress: 68,
        studentCount: 34,
        assignmentCount: 5,
        lastActivity: "4 hours ago",
      },
      {
        id: 103,
        code: "COSC 304",
        name: "Introduction to Databases",
        progress: 75,
        studentCount: 28,
        assignmentCount: 6,
        lastActivity: "2 days ago",
      },
    ],
  },
];

export function getInstitutionData(
  institutionId: string,
): InstitutionCourseData | undefined {
  return institutionCourseData.find(
    (entry) => entry.institutionId === institutionId,
  );
}
