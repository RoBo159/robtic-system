export type Question = {
  id: string;
  question: string;
  answer?: string;
};

export const departmentQuestions: Record<Department, Question[]> = {
  Dev: [
    { id: "q1", question: "What stack do you work with most?" },
    { id: "q2", question: "Share one project you built and your role." },
    { id: "q3", question: "How many hours weekly can you commit?" },
  ],
  Design: [
    { id: "q1", question: "What design tools do you use most?" },
    { id: "q2", question: "How do you handle feedback and revisions?" },
    { id: "q3", question: "How many hours weekly can you commit?" },
  ],
  Moderation: [
    { id: "q1", question: "How do you handle rule violations fairly?" },
    { id: "q2", question: "How would you de-escalate a heated situation?" },
    { id: "q3", question: "How many hours weekly can you commit?" },
  ],
  Community: [
    { id: "q1", question: "How would you keep the community engaged?" },
    { id: "q2", question: "What community activity ideas would you run?" },
    { id: "q3", question: "How many hours weekly can you commit?" },
  ],
  Events: [
    { id: "q1", question: "What event formats can you organize well?" },
    { id: "q2", question: "How would you increase event participation?" },
    { id: "q3", question: "How many hours weekly can you commit?" },
  ],
  Support: [
    { id: "q1", question: "How do you approach helping confused users?" },
    { id: "q2", question: "How do you prioritize multiple support requests?" },
    { id: "q3", question: "How many hours weekly can you commit?" },
  ],
  HR: [
    { id: "q1", question: "How would you evaluate staff applications?" },
    { id: "q2", question: "How do you resolve internal team conflicts?" },
    { id: "q3", question: "How many hours weekly can you commit?" },
  ],
};

export function getQuestionsByDepartment(department: Department): Question[] {
  return departmentQuestions[department] ?? [];
}
