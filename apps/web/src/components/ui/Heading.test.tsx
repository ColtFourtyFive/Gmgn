import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FormSection } from '@/components/account/FormBits';
import { Drawer } from './Drawer';
import { Heading } from './Heading';
import { Panel } from './Panel';

afterEach(cleanup);

const levels = (root: ParentNode = document) => Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => `${h.tagName}:${h.textContent}`);

describe('heading outline', () => {
  it('puts page panels right under the h1 and nests what is inside them', () => {
    render(
      <main>
        <h1>Token</h1>
        <Panel title="Safety & audit">
          <Heading>Holders</Heading>
          <Panel title="Inner">
            <Heading>Deep</Heading>
          </Panel>
        </Panel>
        <FormSection title="Launchpad">
          <Heading>Curve</Heading>
        </FormSection>
      </main>,
    );
    expect(levels()).toEqual(['H1:Token', 'H2:Safety & audit', 'H3:Holders', 'H3:Inner', 'H4:Deep', 'H2:Launchpad', 'H3:Curve']);
  });

  it('starts a dialog at h3 under its h2 title, wherever it was opened', () => {
    render(
      <Panel title="Copy trade">
        <Panel title="Tasks">
          <Drawer open onClose={() => {}} title="New copy task">
            <FormSection title="Wallet to copy">
              <p>…</p>
            </FormSection>
          </Drawer>
        </Panel>
      </Panel>,
    );
    expect(levels(screen.getByRole('dialog'))).toEqual(['H2:New copy task', 'H3:Wallet to copy']);
  });
});
