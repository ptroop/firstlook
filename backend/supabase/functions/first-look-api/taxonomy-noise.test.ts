import assert from 'node:assert/strict';
import test from 'node:test';

import { isNoiseTitle, isNonFinanceTitle, isSeniorTitle } from './classification/taxonomy.ts';
import { classifyJob } from './filters.ts';

// Mirrors the serving gate in index.ts getJobs: noise titles are dropped even
// when the conservative DB classification would keep the row.
function servingGate(title: string, description: string): boolean {
  return !isNoiseTitle(title);
}

test('drops live feed noise: collections, field sales, telecallers and content roles', () => {
  const noise = [
    'Tele caller - Associate',
    'Team Leader-LRM- Chennai',
    'Team Leader - LRM - Jaipur',
    'Growth Management- DGM/ GM',
    'Voice Over Artist',
    'VOC - Research Executive',
    'Campaign Operations- Paytm',
    'Admin & Operations - Internship',
    'Vendor Onboarding Helpdesk',
    'CCM- Varanasi ( Uttar Pradesh)',
    'Content Creator - Trader Channel',
    'AI Video Specialist',
    'Customer Experience Specialist, Mutual Funds',
    'Customer Experience Specialist, Stock Broking',
  ];
  for (const title of noise) assert.equal(isNoiseTitle(title), true, title);
});

test('drops live feed noise: IT architects, SAP/ITSM consultants, QA and testing roles', () => {
  const noise = [
    'Lead Platform Architect (Linux, Virtualisation, VmWare)',
    'Lead Enterprise Management Architect (Observability, AIOPS)',
    'Lead Wintel Architect (VmWare, NSX, SCCM,)',
    'Sr. Quality Analyst',
    'Testing Analyst 1 - C09 - GURUGRAM',
    'IN_Senior Associate_SAP ABAP _SAP_Advisory_Noida',
    'IN_Manager_Employee Central – Time Off_Enterprise Apps SAP_Advisory_ Gurgaon',
    'T&T_ET&P_Senior Consultant_SAP Security & GRC AC_Hyderabad',
    'Consultant | ITAM- Hardware Asset Management | Bengaluru | ServiceNow',
    'Senior Consultant | ITSM (IT Service Management) | Bengaluru | ServiceNow',
    'Consultant | Identity and Access Management | Mumbai | Digital Privacy & Trust',
    'Senior Consultant | OFSAA EPM | Mumbai | Oracle',
    'Senior Consultant | Fusion Financials - (AP, AR, GL, CM, FA, i-Expense) | Delhi | Oracle',
    'Senior Consultant | Anaplan | Mumbai | Finance Transformation',
    'Senior Consultant | Digital Government | Delhi',
    'Consultant | Oracle EPM: All | Bengaluru | Finance Transformation',
    'Digitalization Specialist (Agentic AI)',
    'Computational Data Science Researcher',
    'Digital Analyst',
    'Intelligence Automation Associate',
    'Agentic Development Team Leader / Associate',
    'Applied AI/ML Associate Senior',
    'Applied AI ML - India Lead',
    'Product Analyst  - AIML Platform',
  ];
  for (const title of noise) assert.equal(isNoiseTitle(title), true, title);
});

test('drops live feed noise: senior and lead titles, executive assistants, architects', () => {
  const noise = [
    'Senior Accountant',
    'Senior Accountant R&I-2',
    'Senior Specialist - Operations Processing',
    'Senior Specialist, Transaction Services',
    'Senior Specialist - Market Risk',
    'Managing Consultant, Advisors & Consulting Services, Performance Analytics',
    'Senior Content Strategy Analyst',
    'Senior Product Associate - Monetization and Settlement',
    'Senior Quantitative Analyst – New Product Development',
    'Senior Executive Assistant',
    'Executive Assistant - III',
    'Senior Executive | Integration & Separation | Mumbai',
    'DM / AM / SE | Financial Crime | Bengaluru / Pune',
    'T&T_ ET&P_ Deputy Manager_SAP Advisory_Pan India',
    'Mgr-RRS GCC',
    'Member/Senior Member, Tech Ops (Private Credit)',
    'Senior Member, Tech (Macro)',
    'Senior Specialist - Talent Management - Human Capital (Hyd)',
    'Lead, Tech (QTE)',
    'Lead - Financial Solutions',
    'Fin Solutions Sr. Analyst',
    'Sr Analyst, Tax',
    'Transaction Monitoring People Leader – Correspondent Banking',
    'Data Domain Architect - Associate',
    'Data Operations Analyst - Team Leader',
    'Client Data_Team Leader',
    'Fraud Strategy and Analytics Lead',
  ];
  for (const title of noise) assert.equal(isNoiseTitle(title), true, title);
});

test('drops garbage parse titles and exploratory applications', () => {
  for (const title of ['About the Team', 'Responsibilities', 'India', 'Team Member', 'German, NCT', 'CSG LAF', 'Prospect Application for future Jobs']) {
    assert.equal(isNoiseTitle(title), true, title);
  }
});

test('keeps verified finance roles, including Moody\'s Senior Financial Data Analyst', () => {
  const keep = [
    'Financial Data Analyst',
    'Senior Financial Data Analyst',
    'Analyst - Tax - Financial Operations',
    'Analyst - Compliance (Trade Monitoring)',
    'Analyst - Private Credit Operations & Reporting',
    'Model/Anlys/Valid Analyst I - C09',
    'Tax Analyst 2',
    'KYC Operations Analyst 2',
    'Credit Analyst (Non-Officer)',
    'Financial Planning and Analysis Analyst',
    'Equities Prime Services, Officer',
    'Officer, Securities & Derivatives Analyst - Hybrid',
    'Credit Portfolio Officer',
    'Fund Servicing Associate',
    'Associate - Fund Accounting at BlackRock',
    'Finance Cost Analyst',
    'Credit Control Analyst',
    'Analyst, Credit Risk Management - Consumer',
    'Analyst, Risk Management',
    'Risk Analyst, AS',
    'Clearing and Settlement Analyst, NCT',
    'Apprentice Hiring for 2026- 2027',
    'Young Apprentice - C00 - MUMBAI',
    'Operations Associate - International Wealth Platform',
    'Compliance Associate',
    'Ratings Operations Specialist II',
    'Global Investment Research- Travel and Leisure-Analyst',
    'Controller - Analyst',
    'Valuation Controller Finance -Associate',
  ];
  for (const title of keep) assert.equal(isNoiseTitle(title), false, title);
});

test('noise titles are dropped by the serving gate even when the DB classification is conservative', () => {
  const base = {
    id: 'x', employerJobId: 'x', company: 'Test',
    sourceUrl: 'https://example.com/job', applyUrl: 'https://example.com/apply',
    location: 'Mumbai, India', experienceText: '0-2 years', jobCategory: 'Finance',
    postedAt: '2026-08-01T00:00:00.000Z',
    description: 'Support the finance team of a global financial services company.',
  };
  // classifyJob stays conservative (finance boilerplate can still read as
  // finance); the strict serving gate is what removes noise titles.
  assert.equal(classifyJob({ ...base, title: 'Tele caller - Associate' }), 'match');
  for (const title of ['Tele caller - Associate', 'Lead Platform Architect', 'CCM- Varanasi', 'About the Team', 'Voice Over Artist']) {
    assert.equal(isNoiseTitle(title), true, title);
  }
});

test('keeps finance relevance for role titles that merely include finance-adjacent words', () => {
  assert.equal(isSeniorTitle('Senior Financial Data Analyst'), false);
  assert.equal(isNonFinanceTitle('Senior Financial Data Analyst'), false);
  assert.equal(isNonFinanceTitle('Analyst - Financial Operations'), false);
  assert.equal(isNonFinanceTitle('Data Analytics Analyst - Credit Research'), false);
});
