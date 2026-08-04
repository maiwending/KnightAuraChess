import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PreGameSetupModal from './PreGameSetupModal.jsx';

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  user: { uid: 'u1' },
  timeControls: [
    { label: '3 min', seconds: 180 },
    { label: '5 min', seconds: 300 },
  ],
  selectedTimeControl: 300,
  onSelectTimeControl: vi.fn(),
  boardView: 'flat',
  onSelectBoardView: vi.fn(),
  aiDifficulty: 'medium',
  aiDifficultyLevels: ['easy', 'medium', 'hard'],
  onSelectAiDifficulty: vi.fn(),
  onStartPractice: vi.fn(),
  onStartAi: vi.fn(),
  onStartOnline: vi.fn(),
  isOnline: false,
};

describe('PreGameSetupModal', () => {
  it('does not render when closed', () => {
    const { container } = render(
      <PreGameSetupModal {...baseProps} isOpen={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('triggers setup actions', async () => {
    const user = userEvent.setup();
    render(<PreGameSetupModal {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /3 min/i }));
    await user.click(screen.getByRole('button', { name: /realistic/i }));
    await user.click(screen.getByRole('button', { name: /^hard$/i }));
    await user.click(screen.getByRole('button', { name: /play vs ai/i }));

    expect(baseProps.onSelectTimeControl).toHaveBeenCalledWith(180);
    expect(baseProps.onSelectBoardView).toHaveBeenCalledWith('realistic');
    expect(baseProps.onSelectAiDifficulty).toHaveBeenCalledWith('hard');
    expect(baseProps.onStartAi).toHaveBeenCalledTimes(1);
  });
});
