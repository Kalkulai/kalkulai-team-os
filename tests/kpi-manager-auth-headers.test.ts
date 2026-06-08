import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourcePath = path.resolve(__dirname, '../components/KpiManager.tsx');
const sourceText = readFileSync(sourcePath, 'utf8');
const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function propertyName(node: ts.PropertyName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function getProperty(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find((prop): prop is ts.PropertyAssignment => {
    return ts.isPropertyAssignment(prop) && propertyName(prop.name) === name;
  });
}

function isObjectLiteral(node: ts.Node | undefined): node is ts.ObjectLiteralExpression {
  return !!node && ts.isObjectLiteralExpression(node);
}

function isKpiApiExpression(node: ts.Expression): boolean {
  if (ts.isStringLiteralLike(node)) return node.text === '/api/kpis';
  if (ts.isTemplateExpression(node)) return node.head.text.startsWith('/api/kpis');
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text.startsWith('/api/kpis');
  return false;
}

function collectKpiFetchCalls(): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'fetch' &&
      node.arguments[0] &&
      isKpiApiExpression(node.arguments[0])
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

describe('KpiManager KPI API authentication', () => {
  it('reads the dashboard API secret from the public env var', () => {
    expect(sourceText).toContain("const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';");
  });

  it('sends bearer auth on every /api/kpis fetch call', () => {
    const calls = collectKpiFetchCalls();

    expect(calls).toHaveLength(6);

    for (const call of calls) {
      const options = call.arguments[1];
      expect(ts.isObjectLiteralExpression(options), call.getText(sourceFile)).toBe(true);
      if (!options || !ts.isObjectLiteralExpression(options)) continue;

      const headers = getProperty(options, 'headers')?.initializer;
      expect(isObjectLiteral(headers), call.getText(sourceFile)).toBe(true);
      if (!isObjectLiteral(headers)) continue;

      const authorization = getProperty(headers, 'Authorization')?.initializer;
      expect(authorization?.getText(sourceFile), call.getText(sourceFile)).toBe('`Bearer ${SECRET}`');
    }
  });
});
