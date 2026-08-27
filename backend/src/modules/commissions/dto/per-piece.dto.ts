import { IsNumber, Min } from 'class-validator';

export class UpdatePerPieceRateDto {
  @IsNumber()
  @Min(0)
  amount!: number;
}
