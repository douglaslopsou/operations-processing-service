import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { CreateOperationDto } from './dto/create-operation.dto';

@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async createOperation(@Body() dto: CreateOperationDto) {
    return await this.operationsService.createOperation(dto);
  }
}
