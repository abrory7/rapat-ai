import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Seed Skills
  const skillCodeReview = await prisma.skill.upsert({
    where: { id: 'skill-code-review' },
    update: {},
    create: {
      id: 'skill-code-review',
      name: 'Code Review Checklist',
      description: 'Guidelines for reviewing code structure, logic, and clarity.',
      content: `### Code Review Checklist
- **Clarity:** Is the code easy to read and understand?
- **Style:** Does it follow the established style guidelines?
- **Logic:** Are there any obvious bugs, edge cases not handled, or logic errors?
- **Performance:** Are there inefficient loops, unnecessary database queries, or memory leaks?
- **Tests:** Are there sufficient tests for the changes?`,
      isBuiltIn: true,
    },
  });

  const skillSecurityAudit = await prisma.skill.upsert({
    where: { id: 'skill-security-audit' },
    update: {},
    create: {
      id: 'skill-security-audit',
      name: 'Security Audit Guide',
      description: 'Guidelines for identifying vulnerabilities and security risks.',
      content: `### Security Audit Guide
- **Input Validation:** Are all user inputs sanitized and validated?
- **Authentication/Authorization:** Are endpoints properly secured?
- **Data Protection:** Is sensitive data encrypted at rest and in transit?
- **Dependencies:** Are there known vulnerabilities in third-party libraries?
- **OWASP Top 10:** Check for Injection, Broken Auth, XSS, SSRF, etc.`,
      isBuiltIn: true,
    },
  });

  console.log('Skills seeded.');

  const skillEngineeringBrainstorm = await prisma.skill.upsert({
    where: { id: 'skill-engineering-brainstorm' },
    update: {},
    create: {
      id: 'skill-engineering-brainstorm',
      name: 'Engineering Brainstorm Mindset',
      description: 'Guidelines for participating in technical discussions without immediately coding.',
      content: `### Engineering Brainstorm Mindset
- **Implementation Strategy First:** Leave the high-level system design to the Architect. Your job is to focus on the "How": folder structures, specific libraries, code organization, and concrete technical task breakdowns.
- **No Immediate Coding:** You are in a discussion forum to plan and brainstorm, NOT an IDE. Do NOT write full implementations or functions.
- **Explain the "Why":** When proposing an algorithm or technical approach, explain why it is the most efficient or robust method.
- **Use Pseudo-code Sparingly:** Only use very brief pseudo-code or small code snippets if absolutely necessary to illustrate a complex algorithm or component logic.
- **Collaborate & Question:** Review the Architect's design for practical implementation flaws. Break down the final accepted design into actionable steps for developers.`,
      isBuiltIn: true,
    },
  });

  const skillArchitectBrainstorm = await prisma.skill.upsert({
    where: { id: 'skill-architect-brainstorm' },
    update: {},
    create: {
      id: 'skill-architect-brainstorm',
      name: 'Architect Brainstorm Mindset',
      description: 'Guidelines for participating in conceptual design discussions without over-detailing.',
      content: `### Architect Brainstorm Mindset
- **Conceptual Design First:** Focus on the "Big Picture". Your domain is system architecture, technology stack selection, database modeling, API strategies, scaling, and security paradigms.
- **No Over-detailing:** You are brainstorming, not writing documentation. Do NOT write extensive API specs, full schema definitions, or massive boilerplate code. Keep your proposals conceptual.
- **Discuss Trade-offs:** Always weigh the pros and cons of an architectural choice (e.g., latency vs. throughput, SQL vs. NoSQL, scaling horizontally vs. vertically).
- **Guide the Engineer:** Set the technical boundaries and let the Lead Engineer figure out the low-level folder structures and specific implementations.
- **Stay High-Level:** Use bullet points to list data models or architecture components rather than writing out the actual code to create them.`,
      isBuiltIn: true,
    },
  });

  const skillQaSecBrainstorm = await prisma.skill.upsert({
    where: { id: 'skill-qasec-brainstorm' },
    update: {},
    create: {
      id: 'skill-qasec-brainstorm',
      name: 'QA & Security Brainstorm Mindset',
      description: 'Guidelines for participating in QA and security discussions without over-detailing.',
      content: `### QA & Security Brainstorm Mindset
- **Risk Assessment First:** Focus on identifying edge cases, potential bottlenecks, and security vulnerabilities in the proposed architectures.
- **No Over-detailing:** You are brainstorming testing strategies, not writing test suites. Do NOT write full E2E scripts, massive Jest/Cypress files, or CI/CD YAML configurations.
- **Conceptual Testing Strategy:** Propose high-level testing plans (e.g., "We need load testing for the payment gateway" or "We should implement rate limiting here") instead of writing the actual code to do it.
- **Challenge the Plan:** Your job is to poke holes in the Architect's and Engineer's plans to ensure robustness. Look for single points of failure.
- **Stay High-Level:** Use bullet points to list security checklists or test cases rather than writing out the actual test implementation.`,
      isBuiltIn: true,
    },
  });

  const skillPmBrainstorm = await prisma.skill.upsert({
    where: { id: 'skill-pm-brainstorm' },
    update: {},
    create: {
      id: 'skill-pm-brainstorm',
      name: 'Project Manager Brainstorm Mindset',
      description: 'Guidelines for moderating and directing technical discussions to stay on track.',
      content: `### Project Manager Brainstorm Mindset
- **Scope & Goals First:** Your primary job is to ensure the discussion aligns with the business goals, timeline, and scope. You are the guardian of the project's objective.
- **Prevent Rabbit Holes:** If the Architect, Engineer, or QA start arguing over minor technical details or edge cases that don't impact the MVP, stop them. Defer off-topic debates using the "- [PARKING LOT] <item>" tag.
- **Drive Decisions:** Summarize complex technical debates into concrete choices. Push the team to commit to an approach using the "- [DECISION] <item>" tag.
- **Delegate & Ask:** You don't need to know all the technical answers. Ask pointed questions to the right specialist (e.g., "@architect, what's the fastest way to build this?" or "@qa-sec, does this approach introduce critical delays?").
- **Summarize & Move Forward:** Keep the momentum going. Once a component is agreed upon, explicitly move the discussion to the next required component.`,
      isBuiltIn: true,
    },
  });

  // 2. Seed Roles
  const rolesData = [
    {
      id: 'role-pm',
      name: 'Project Manager',
      slug: 'pm',
      systemPrompt: 'You are the Project Manager. Define the scope of work, coordinate the lineup, delegate tasks to other roles using their @SLUG, and compile the final action plan. At the end of the discussion, you compile the final planning document. Keep the team focused on the target goals.',
      color: '#3b82f6',
      icon: '💼',
      isBuiltIn: true,
    },
    {
      id: 'role-architect',
      name: 'Lead Architect',
      slug: 'architect',
      systemPrompt: 'You are the Lead Architect. Focus on system design, database schemas, component structures, API endpoints, and technological selection. Discuss scalability and trade-offs of the chosen architecture.',
      color: '#8b5cf6',
      icon: '🏛️',
      isBuiltIn: true,
    },
    {
      id: 'role-engineer',
      name: 'Lead Engineer',
      slug: 'engineer',
      systemPrompt: 'You are the Lead Engineer. Focus on concrete implementation steps, folder structure, code templates, algorithms, and technical task breakdowns. Write clean, direct pseudo-code or actual code snippets where helpful.',
      color: '#10b981',
      icon: '⚙️',
      isBuiltIn: true,
    },
    {
      id: 'role-qa-sec',
      name: 'QA & Security Reviewer',
      slug: 'qa-sec',
      systemPrompt: 'You are the QA & Security Reviewer. Evaluate potential bugs, edge cases, performance bottlenecks, and security hazards. Ensure there is a testing strategy (unit, integration, E2E) and security controls.',
      color: '#f43f5e',
      icon: '🛡️',
      isBuiltIn: true,
    },
    {
      id: 'role-strategist',
      name: 'Marketing Strategist',
      slug: 'strategist',
      systemPrompt: 'You are the Marketing Strategist. Define target audience personas, marketing positioning, messaging pillars, acquisition channels, and general market launching tactics.',
      color: '#f59e0b',
      icon: '📈',
      isBuiltIn: true,
    },
    {
      id: 'role-creative-director',
      name: 'Creative Director',
      slug: 'creative-director',
      systemPrompt: 'You are the Creative Director. Shape the branding narrative, campaign concepts, copy tone, and visual direction. Offer fresh, engaging ideas that capture user imagination.',
      color: '#ec4899',
      icon: '🎨',
      isBuiltIn: true,
    },
    {
      id: 'role-data-analyst',
      name: 'Data Analyst',
      slug: 'data-analyst',
      systemPrompt: 'You are the Data Analyst. Identify key performance indicators (KPIs), metrics dashboards, user behavior tracking nodes, and success metrics for the campaign.',
      color: '#06b6d4',
      icon: '📊',
      isBuiltIn: true,
    },
    {
      id: 'role-facilitator',
      name: 'Discussion Facilitator',
      slug: 'facilitator',
      systemPrompt: 'You are the Discussion Facilitator. Guide the brainstorm session, coordinate different views, resolve conflicts, keep ideas organized, and summarize the main takeaways.',
      color: '#6b7280',
      icon: '🗣️',
      isBuiltIn: true,
    },
    {
      id: 'role-optimist',
      name: 'Ideas Explorer',
      slug: 'optimist',
      systemPrompt: 'You are the Ideas Explorer. Bring unbounded enthusiasm and positivity to the discussion. Explore new opportunities, potential positive impacts, and expand ideas into ambitious visions.',
      color: '#eab308',
      icon: '🌟',
      isBuiltIn: true,
    },
    {
      id: 'role-critic',
      name: 'Devil\'s Advocate',
      slug: 'critic',
      systemPrompt: 'You are the Devil\'s Advocate. Play the skeptic. Highlight assumptions, potential points of failure, hidden costs, and logistical issues. Challenge the team to make the plan bulletproof.',
      color: '#ef4444',
      icon: '😈',
      isBuiltIn: true,
    },
  ];

  const dbRoles: Record<string, any> = {};
  for (const role of rolesData) {
    dbRoles[role.slug] = await prisma.role.upsert({
      where: { slug: role.slug },
      update: {
        name: role.name,
        systemPrompt: role.systemPrompt,
        color: role.color,
        icon: role.icon,
      },
      create: role,
    });
  }

  console.log('Roles seeded.');

  // Attach skills to built-in roles
  // PM gets PM Brainstorm Mindset skill
  await prisma.roleSkill.upsert({
    where: {
      roleId_skillId: {
        roleId: dbRoles['pm'].id,
        skillId: skillPmBrainstorm.id,
      },
    },
    update: {},
    create: {
      roleId: dbRoles['pm'].id,
      skillId: skillPmBrainstorm.id,
    },
  });

  // Clean up legacy skill: Lead Architect should NOT have Code Review skill in brainstorming
  await prisma.roleSkill.deleteMany({
    where: {
      roleId: dbRoles['architect'].id,
      skillId: skillCodeReview.id,
    },
  });

  // Lead Architect gets Architect Brainstorm Mindset skill
  await prisma.roleSkill.upsert({
    where: {
      roleId_skillId: {
        roleId: dbRoles['architect'].id,
        skillId: skillArchitectBrainstorm.id,
      },
    },
    update: {},
    create: {
      roleId: dbRoles['architect'].id,
      skillId: skillArchitectBrainstorm.id,
    },
  });

  // QA-Sec gets Security Audit skill
  await prisma.roleSkill.upsert({
    where: {
      roleId_skillId: {
        roleId: dbRoles['qa-sec'].id,
        skillId: skillSecurityAudit.id,
      },
    },
    update: {},
    create: {
      roleId: dbRoles['qa-sec'].id,
      skillId: skillSecurityAudit.id,
    },
  });

  // QA-Sec gets QA & Sec Brainstorm Mindset skill
  await prisma.roleSkill.upsert({
    where: {
      roleId_skillId: {
        roleId: dbRoles['qa-sec'].id,
        skillId: skillQaSecBrainstorm.id,
      },
    },
    update: {},
    create: {
      roleId: dbRoles['qa-sec'].id,
      skillId: skillQaSecBrainstorm.id,
    },
  });

  console.log('RoleSkills seeded.');

  // Lead Engineer gets Engineering Brainstorm Mindset skill
  await prisma.roleSkill.upsert({
    where: {
      roleId_skillId: {
        roleId: dbRoles['engineer'].id,
        skillId: skillEngineeringBrainstorm.id,
      },
    },
    update: {},
    create: {
      roleId: dbRoles['engineer'].id,
      skillId: skillEngineeringBrainstorm.id,
    },
  });

  // 3. Seed Templates
  const templatesData = [
    {
      id: 'template-software-feature',
      name: 'Software Feature Planning',
      description: 'Collaborative development cycle involving PM, Architect, Engineer, and QA-Sec to draft a concrete software specification.',
      defaultFlow: JSON.stringify(['pm', 'architect', 'engineer', 'qa-sec']),
      maxRounds: 5,
      rules: `### Discussion Rules
- PM initiates the scope and delegates to @architect.
- Architect drafts the tech design, then delegates to @engineer.
- Engineer writes the step-by-step implementation, then delegates to @qa-sec.
- QA-Sec evaluates risks, tests, and security, then delegates back to @pm.
- Roles can deviate or suggest others if needed, using @SLUG.`,
      isBuiltIn: true,
    },
    {
      id: 'template-marketing-strategy',
      name: 'Marketing Strategy',
      description: 'Align creative branding and metrics-driven launching plan using Strategist, Creative Director, and Data Analyst.',
      defaultFlow: JSON.stringify(['strategist', 'creative-director', 'data-analyst']),
      maxRounds: 2,
      rules: `### Discussion Rules
- Strategist defines target audience and market position.
- Creative Director designs visual campaigns and messaging style.
- Data Analyst identifies tracking criteria and KPIs.`,
      isBuiltIn: true,
    },
    {
      id: 'template-general-brainstorming',
      name: 'General Brainstorming',
      description: 'Ideation framework guided by a Facilitator, with Optimist exploring possibilities and Critic probing constraints.',
      defaultFlow: JSON.stringify(['facilitator', 'optimist', 'critic']),
      maxRounds: 2,
      rules: `### Discussion Rules
- Facilitator guides the general direction.
- Optimist adds ideas without constraints.
- Critic challenges assumptions and lists execution hurdles.`,
      isBuiltIn: true,
    },
  ];

  for (const t of templatesData) {
    const dbTemplate = await prisma.discussionTemplate.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        description: t.description,
        defaultFlow: t.defaultFlow,
        maxRounds: t.maxRounds,
        rules: t.rules,
      },
      create: t,
    });

    // Seed TemplateRoles
    const flowSlugs = JSON.parse(t.defaultFlow) as string[];
    for (let i = 0; i < flowSlugs.length; i++) {
      const slug = flowSlugs[i];
      const role = dbRoles[slug];
      if (role) {
        await prisma.templateRole.upsert({
          where: {
            templateId_roleId: {
              templateId: dbTemplate.id,
              roleId: role.id,
            },
          },
          update: {
            order: i,
          },
          create: {
            templateId: dbTemplate.id,
            roleId: role.id,
            order: i,
          },
        });
      }
    }
  }

  console.log('Templates seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
