import { ehAreaDoAluno } from './app';

describe('ehAreaDoAluno', () => {
    it('reconhece só a área do aluno, não a tela de alunos dos professores', () => {
        expect(ehAreaDoAluno('/aluno')).toBe(true);
        expect(ehAreaDoAluno('/aluno?codigo=1')).toBe(true);
        expect(ehAreaDoAluno('/alunos')).toBe(false);
        expect(ehAreaDoAluno('/alunos/Ip%C3%AA%20Lil%C3%A1s')).toBe(false);
        expect(ehAreaDoAluno('/inicio')).toBe(false);
    });
});
